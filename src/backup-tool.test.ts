import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import AdmZip from 'adm-zip';
import { strict as assert } from 'assert';
import sqlite3 from 'sqlite3';
import os from 'os'; // For os.tmpdir()

// Define interfaces for your test data
interface TestTransaction {
  id?: string; // Actual API might return id
  date: string;
  amount: number;
  payee_name?: string;
  notes?: string;
  account_id: string;
  category_id?: string;
  account?: string; // Used by addTransactions
  category?: string; // Used by addTransactions
}

interface TestAccount {
  id?: string; // Actual API might return id
  name: string;
  type: 'checking' | 'savings' | string;
}

interface TestCategory {
  id?: string; // Actual API might return id
  name: string;
}

interface TestData {
  accounts: TestAccount[];
  categories: TestCategory[];
  // transactions are not directly returned by setupTestData in a queryable list by ID
}


const ACTUAL_SERVER_URL = process.env.ACTUAL_SERVER_URL || 'http://localhost:3001';
const ACTUAL_SERVER_PASSWORD = process.env.ACTUAL_SERVER_PASSWORD || 'testpassword';
const ACTUAL_DATA_DIR = process.env.ACTUAL_DATA_DIR || '/tmp/actual-data';

const TEST_SETUP_DATA_SUBDIR = 'test-setup-temp-data';


async function initializeApi() {
  const api = await import('@actual-app/api');
  const testSetupDataDir = path.join(ACTUAL_DATA_DIR, TEST_SETUP_DATA_SUBDIR);
  await fs.mkdir(testSetupDataDir, { recursive: true });

  console.log(`Initializing API with server URL: ${ACTUAL_SERVER_URL} and data directory: ${testSetupDataDir}`);
  await api.init({
    serverURL: ACTUAL_SERVER_URL,
    password: ACTUAL_SERVER_PASSWORD,
    dataDir: testSetupDataDir
  });
  return api;
}

export async function setupTestData(api: any, budgetId: string): Promise<TestData> {
  console.log(`Setting up test data for budget ID: ${budgetId}...`);

  const account1 = await api.createAccount({ name: 'Test Checking Account', type: 'checking' }, budgetId);
  const account2 = await api.createAccount({ name: 'Test Savings Account', type: 'savings' }, budgetId);
  console.log('Created accounts:', account1.id, account2.id);

  const category1 = await api.createCategory({ name: 'Groceries' }, budgetId);
  const category2 = await api.createCategory({ name: 'Utilities' }, budgetId);
  console.log('Created categories:', category1.id, category2.id);

  const transactions: Partial<TestTransaction>[] = [
    { date: '2023-01-15', amount: -5000, payee_name: 'Grocery Store', account_id: account1.id, category_id: category1.id, notes: 'Test grocery transaction' },
    { date: '2023-01-16', amount: -7500, payee_name: 'Electric Company', account_id: account1.id, category_id: category2.id, notes: 'Test utility bill' },
    { date: '2023-01-17', amount: 200000, payee_name: 'Salary Deposit', account_id: account1.id, notes: 'Test salary deposit' },
  ];

  await api.addTransactions(budgetId, transactions.map(t => ({
    ...t,
    account: t.account_id,
    category: t.category_id,
  })));
  console.log('Added transactions.');

  return {
    accounts: [account1, account2],
    categories: [category1, category2],
  };
}

export async function cleanupTestData() {
  console.log('Cleaning up test data (client-side session data)...');
  const testSetupDataDir = path.join(ACTUAL_DATA_DIR, TEST_SETUP_DATA_SUBDIR);
  try {
    await fs.rm(testSetupDataDir, { recursive: true, force: true });
    console.log(`Cleaned up test setup temp data dir: ${testSetupDataDir}`);
  } catch (error) {
    console.error(`Error during test data cleanup of ${testSetupDataDir}:`, error);
  }
}

async function runBackupTest(budgetId: string, createdTestData: TestData) {
  console.log(`\n--- Starting Backup Tool Test for budget ID: ${budgetId} ---`);
  const tempBackupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'actual-backup-test-'));
  const tempExtractDir = await fs.mkdtemp(path.join(os.tmpdir(), 'actual-extract-test-'));
  // Use ts-node to run the TypeScript backup tool directly
  const backupToolScript = path.resolve(__dirname, './backup-tool.ts'); 

  // Construct the command
  // Ensure SERVER_URL and SERVER_PASSWORD are set in the environment for the backup tool
  const command = `ts-node ${backupToolScript} --sync-id ${budgetId} --backup-dir ${tempBackupDir}`;
  
  console.log(`Executing backup tool: ${command}`);
  console.log(`  SERVER_URL: ${ACTUAL_SERVER_URL}`);
  // Not logging password

  try {
    const { stdout, stderr } = await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
      exec(command, { 
        env: { 
          ...process.env, 
          SERVER_URL: ACTUAL_SERVER_URL, 
          SERVER_PASSWORD: ACTUAL_SERVER_PASSWORD,
          // ts-node might need this if run from a different context in some setups
          NODE_ENV: process.env.NODE_ENV || 'development' 
        } 
      }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Backup tool execution error: ${error.message}`);
          console.error(`stderr: ${stderr}`);
          console.error(`stdout: ${stdout}`);
          return reject(error);
        }
        resolve({ stdout, stderr });
      });
    });

    console.log(`Backup tool stdout: ${stdout}`);
    if (stderr) {
      // Non-fatal errors from actual-server might go to stderr but tool can still succeed
      console.warn(`Backup tool stderr: ${stderr}`); 
    }

    // Locate the backup ZIP file
    const filesInBackupDir = await fs.readdir(tempBackupDir);
    const zipFile = filesInBackupDir.find(f => f.endsWith('.zip'));
    assert(zipFile, `Backup ZIP file not found in ${tempBackupDir}`);
    console.log(`Found backup ZIP file: ${zipFile}`);
    const zipFilePath = path.join(tempBackupDir, zipFile);

    // Extract the backup ZIP
    console.log(`Extracting ${zipFilePath} to ${tempExtractDir}`);
    const admZip = new AdmZip(zipFilePath);
    admZip.extractAllTo(tempExtractDir, true);
    const extractedFiles = await fs.readdir(tempExtractDir);
    console.log('Extracted files:', extractedFiles);

    // Verify backup contents
    assert(extractedFiles.includes('db.sqlite'), 'db.sqlite not found in backup');
    assert(extractedFiles.includes('metadata.json'), 'metadata.json not found in backup');
    console.log('Core backup files (db.sqlite, metadata.json) found.');

    // Verify database content
    const dbPath = path.join(tempExtractDir, 'db.sqlite');
    console.log(`Opening database: ${dbPath}`);
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            console.error('Failed to open database:', err.message);
            throw err; // Propagate error to fail the test
        }
        console.log('Database opened successfully.');
    });

    // Helper function to query the database
    const queryDb = (sql: string, params: any[] = []) => {
      return new Promise<any[]>((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) {
            return reject(err);
          }
          resolve(rows);
        });
      });
    };

    console.log('Verifying accounts...');
    for (const account of createdTestData.accounts) {
      const rows = await queryDb('SELECT name, type, offbudget, closed FROM accounts WHERE id = ?', [account.id]);
      assert.strictEqual(rows.length, 1, `Account ${account.name} (ID: ${account.id}) not found or found multiple times.`);
      assert.strictEqual(rows[0].name, account.name, `Account name mismatch for ${account.id}`);
      console.log(`Found account: ${rows[0].name} (Type: ${rows[0].type})`);
    }

    console.log('Verifying categories...');
    for (const category of createdTestData.categories) {
      const rows = await queryDb('SELECT name FROM categories WHERE id = ?', [category.id]);
      assert.strictEqual(rows.length, 1, `Category ${category.name} (ID: ${category.id}) not found or found multiple times.`);
      assert.strictEqual(rows[0].name, category.name, `Category name mismatch for ${category.id}`);
      console.log(`Found category: ${rows[0].name}`);
    }
    
    console.log('Verifying transactions (count and amounts for a specific account)...');
    // Example: verify transactions for 'Test Checking Account'
    const checkingAccount = createdTestData.accounts.find(acc => acc.name === 'Test Checking Account');
    assert(checkingAccount, "Test Checking Account not found in test data for verification.");
    assert(checkingAccount.id, "Test Checking Account ID is undefined.");

    const dbTransactions = await queryDb('SELECT amount, payee_name, notes FROM transactions WHERE account_id = ? ORDER BY amount', [checkingAccount.id]);
    assert.strictEqual(dbTransactions.length, 3, `Expected 3 transactions for ${checkingAccount.name}, found ${dbTransactions.length}`);
    
    // Amounts are in cents
    const expectedAmounts = [-7500, -5000, 200000].sort((a,b) => a-b); // Sort to match query order
    const actualAmounts = dbTransactions.map(t => t.amount).sort((a,b) => a-b);
    assert.deepStrictEqual(actualAmounts, expectedAmounts, `Transaction amounts mismatch for ${checkingAccount.name}`);
    console.log('Transaction amounts verified for Test Checking Account.');

    // Verify a specific transaction's details (e.g., payee and notes for one of them)
    const groceryTransaction = dbTransactions.find(t => t.amount === -5000);
    assert(groceryTransaction, "Grocery transaction not found in backup for Test Checking Account");
    assert.strictEqual(groceryTransaction.payee_name, 'Grocery Store', "Grocery transaction payee mismatch");
    assert.strictEqual(groceryTransaction.notes, 'Test grocery transaction', "Grocery transaction notes mismatch");
    console.log('Specific transaction details verified for grocery purchase.');


    console.log('Database verification successful.');
    db.close((err) => {
        if (err) console.error('Error closing database:', err.message);
        else console.log('Database closed.');
    });

    console.log('--- Backup Tool Test Succeeded ---');

  } catch (error) {
    console.error('--- Backup Tool Test Failed ---');
    console.error(error);
    throw error; // Re-throw to ensure the test runner catches it
  } finally {
    console.log('Cleaning up temporary directories...');
    try {
      await fs.rm(tempBackupDir, { recursive: true, force: true });
      console.log(`Cleaned up temp backup dir: ${tempBackupDir}`);
    } catch (e) {
      console.error(`Error cleaning up ${tempBackupDir}:`, e);
    }
    try {
      await fs.rm(tempExtractDir, { recursive: true, force: true });
      console.log(`Cleaned up temp extract dir: ${tempExtractDir}`);
    } catch (e) {
      console.error(`Error cleaning up ${tempExtractDir}:`, e);
    }
  }
}


// Main function to orchestrate setup and tests
async function main() {
  let api;
  let budgetSyncId: string | null = null;
  let createdTestData: TestData | null = null;

  try {
    api = await initializeApi();
    console.log('API initialized.');

    const budget = await api.createBudget({ budgetName: 'TestBudgetForBackupTool' });
    budgetSyncId = budget.id;
    console.log(`Test budget created with sync ID: ${budgetSyncId}`);

    createdTestData = await setupTestData(api, budgetSyncId);
    console.log('Test data setup complete.');
    
    assert(createdTestData, "Test data was not created successfully."); // Should not happen if setupTestData resolves

    await runBackupTest(budgetSyncId, createdTestData);
    console.log("\nAll tests completed successfully.");

  } catch (err) {
    console.error('Error in test utilities script:', err);
    if (err.message && err.message.includes('ECONNREFUSED')) {
      console.error(`Connection refused. Ensure the Actual server is running at ${ACTUAL_SERVER_URL}.`);
      console.error("You might need to run 'devenv up' or 'nix develop' in another terminal.");
    }
    process.exitCode = 1; // Indicate failure
  } finally {
    if (api) {
      await cleanupTestData(); // Cleans client-side API session data
      console.log('Shutting down API connection for test utilities...');
      await api.shutdown();
      console.log('API connection for test utilities shut down.');
    }
    // Server-side budget file (e.g., TestBudgetForBackupTool.actual) in ACTUAL_DATA_DIR
    // is not automatically cleaned up by this script. This is usually fine for tests,
    // or could be handled by `devenv clean` or a separate cleanup script if needed.
    // For now, we are focusing on the backup tool's functionality.
  }
}

// Execute main if the script is run directly
if (require.main === module) {
  main().catch(error => {
    console.error("Unhandled error in main execution:", error);
    process.exitCode = 1; // Indicate failure
  });
}
