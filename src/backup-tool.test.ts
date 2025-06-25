import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import AdmZip from 'adm-zip';
import { strict as assert } from 'assert';
import sqlite3 from 'sqlite3';
import os from 'os'; // For os.tmpdir()

import * as api from '@actual-app/api';
import { v4 as uuidv4 } from 'uuid';

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

const TEMPLATE_BUDGET_SOURCE_DIR = path.resolve(__dirname, '..', 'test-template-budget');
const ACTUAL_SERVER_URL = process.env.ACTUAL_SERVER_URL || 'http://localhost:3001';
const ACTUAL_SERVER_PASSWORD = process.env.ACTUAL_SERVER_PASSWORD || 'testpassword';

// THIS NOW COMES FROM THE (potentially adjusted) ENV VAR
const SERVER_EFFECTIVE_DATA_DIR = process.env.ACTUAL_DATA_DIR || "/tmp/actual-data";
const CLIENT_API_CACHE_SUBDIR_NAME = 'test-client-api-cache'; // Give it a distinct name



async function initializeApi(clientApiCacheBaseDir: string) { // Pass client cache dir explicitly
  await fs.ensureDir(clientApiCacheBaseDir);

  console.log(`Initializing API with server URL: ${ACTUAL_SERVER_URL} and CLIENT data directory: ${clientApiCacheBaseDir}`);
  await api.init({
    serverURL: ACTUAL_SERVER_URL,
    password: ACTUAL_SERVER_PASSWORD,
    dataDir: clientApiCacheBaseDir
  });
  return api;
}

export async function setupTestData(actualApi: typeof api): Promise<TestData> {
  console.log(`Setting up test data for the loaded budget...`);

  // Account details
  const checkingAccountDetails = { name: 'Test Checking Account', type: 'checking' as const };
  const savingsAccountDetails = { name: 'Test Savings Account', type: 'savings' as const };

  // Create accounts and get their IDs
  const account1Id = await actualApi.createAccount(checkingAccountDetails, 0);
  const account2Id = await actualApi.createAccount(savingsAccountDetails, 0);
  console.log('Created account IDs:', account1Id, account2Id);

  // Category details
  const groceriesCategoryDetails = { name: 'Groceries' };
  const utilitiesCategoryDetails = { name: 'Utilities' };

  // Create categories and get their IDs - createCategory does not take budgetId as a second param usually
  // Operations are scoped to the loaded budget.
  const category1Id = await actualApi.createCategory(groceriesCategoryDetails);
  const category2Id = await actualApi.createCategory(utilitiesCategoryDetails);
  console.log('Created category IDs:', category1Id, category2Id);

  // Construct TestAccount and TestCategory objects
  const account1: TestAccount = { ...checkingAccountDetails, id: account1Id };
  const account2: TestAccount = { ...savingsAccountDetails, id: account2Id };
  const category1: TestCategory = { ...groceriesCategoryDetails, id: category1Id };
  const category2: TestCategory = { ...utilitiesCategoryDetails, id: category2Id };

  const transactions: Partial<TestTransaction>[] = [
    { date: '2023-01-15', amount: -5000, payee_name: 'Grocery Store', account_id: account1Id, category_id: category1Id, notes: 'Test grocery transaction' },
    { date: '2023-01-16', amount: -7500, payee_name: 'Electric Company', account_id: account1Id, category_id: category2Id, notes: 'Test utility bill' },
    { date: '2023-01-17', amount: 200000, payee_name: 'Salary Deposit', account_id: account1Id, notes: 'Test salary deposit' },
  ];

  await actualApi.addTransactions(account1Id, transactions.filter(t => t.account_id === account1Id).map(t => ({
    date: t.date,
    amount: t.amount,
    payee_name: t.payee_name,
    category_id: t.category_id, // API expects category_id here for mapping
    notes: t.notes,
  })));
  console.log('Added transactions to Test Checking Account.');

  return {
    accounts: [account1, account2],
    categories: [category1, category2],
  };
}

// export async function cleanupTestData() {
//   console.log('Cleaning up test data (client-side session data)...');
//   const testSetupDataDir = path.join(ACTUAL_DATA_DIR, TEST_SETUP_DATA_SUBDIR);
//   try {
//     await fs.rm(testSetupDataDir, { recursive: true, force: true });
//     console.log(`Cleaned up test setup temp data dir: ${testSetupDataDir}`);
//   } catch (error) {
//     console.error(`Error during test data cleanup of ${testSetupDataDir}:`, error);
//   }
// }

async function runBackupTest(budgetId: string, createdTestData: TestData) {
  console.log(`\n--- Starting Backup Tool Test for budget ID: ${budgetId} ---`);
  const tempBackupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'actual-backup-test-'));
  const tempExtractDir = await fs.mkdtemp(path.join(os.tmpdir(), 'actual-extract-test-'));
  const backupToolScript = path.resolve(__dirname, './backup-tool.ts');

  const command = `ts-node ${backupToolScript} --sync-id ${budgetId} --backup-dir ${tempBackupDir}`;

  console.log(`Executing backup tool: ${command}`);
  console.log(`  SERVER_URL: ${ACTUAL_SERVER_URL}`);

  try {
    const { stdout, stderr } = await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
      exec(command, {
        env: {
          ...process.env,
          SERVER_URL: ACTUAL_SERVER_URL,
          SERVER_PASSWORD: ACTUAL_SERVER_PASSWORD,
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
      console.warn(`Backup tool stderr: ${stderr}`);
    }

    const filesInBackupDir = await fs.readdir(tempBackupDir);
    const zipFile = filesInBackupDir.find(f => f.endsWith('.zip'));
    assert(zipFile, `Backup ZIP file not found in ${tempBackupDir}`);
    console.log(`Found backup ZIP file: ${zipFile}`);
    const zipFilePath = path.join(tempBackupDir, zipFile);

    console.log(`Extracting ${zipFilePath} to ${tempExtractDir}`);
    const admZip = new AdmZip(zipFilePath);
    admZip.extractAllTo(tempExtractDir, true);
    const extractedFiles = await fs.readdir(tempExtractDir);
    console.log('Extracted files:', extractedFiles);

    assert(extractedFiles.includes('db.sqlite'), 'db.sqlite not found in backup');
    assert(extractedFiles.includes('metadata.json'), 'metadata.json not found in backup');
    console.log('Core backup files (db.sqlite, metadata.json) found.');

    const dbPath = path.join(tempExtractDir, 'db.sqlite');
    console.log(`Opening database: ${dbPath}`);
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.error('Failed to open database:', err.message);
        throw err;
      }
      console.log('Database opened successfully.');
    });

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
      assert.strictEqual(rows[0].type, account.type, `Account type mismatch for ${account.id}`); // Added type check
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
    const checkingAccount = createdTestData.accounts.find(acc => acc.name === 'Test Checking Account');
    assert(checkingAccount, "Test Checking Account not found in test data for verification.");
    // checkingAccount.id is now guaranteed to be a string by the TestAccount interface

    const dbTransactions = await queryDb('SELECT amount, payee_name, notes FROM transactions WHERE account_id = ? ORDER BY amount', [checkingAccount.id]);
    assert.strictEqual(dbTransactions.length, 3, `Expected 3 transactions for ${checkingAccount.name}, found ${dbTransactions.length}`);

    const expectedAmounts = [-7500, -5000, 200000].sort((a, b) => a - b);
    const actualAmounts = dbTransactions.map(t => t.amount).sort((a, b) => a - b);
    assert.deepStrictEqual(actualAmounts, expectedAmounts, `Transaction amounts mismatch for ${checkingAccount.name}`);
    console.log('Transaction amounts verified for Test Checking Account.');

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
    throw error;
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

async function primeServerWithBudget(
  templateSourceDir: string,
  serverBaseDataDir: string, // Will be SERVER_EFFECTIVE_DATA_DIR
  newBudgetGroupId: string
): Promise<void> {
  const serverUserFilesDir = path.join(serverBaseDataDir, 'user-files');
  const budgetFileDirOnServer = path.join(serverUserFilesDir, `${newBudgetGroupId}.actual`);

  await fs.ensureDir(budgetFileDirOnServer);
  console.log(`   Copying template db.sqlite to server: ${path.join(budgetFileDirOnServer, 'db.sqlite')}`);
  await fs.copy(path.join(templateSourceDir, 'db.sqlite'), path.join(budgetFileDirOnServer, 'db.sqlite'));

  const metadataTemplatePath = path.join(templateSourceDir, 'metadata.json');
  let metadata = JSON.parse(await fs.readFile(metadataTemplatePath, 'utf8'));
  metadata.groupId = newBudgetGroupId;
  metadata.fileId = uuidv4();

  console.log(`   Writing modified metadata.json to server: ${path.join(budgetFileDirOnServer, 'metadata.json')} with groupId: ${newBudgetGroupId}`);
  await fs.writeFile(path.join(budgetFileDirOnServer, 'metadata.json'), JSON.stringify(metadata, null, 2));
}

// CLIENT PRIMING: Puts budget into client API's expected cache structure
async function primeClientCacheWithBudget(
  templateSourceDir: string,
  clientApiCacheBaseDir: string, // e.g., ./test-actual-server-data/test-setup-temp-data
  newBudgetGroupId: string // This will be the sub-directory name in the client cache
): Promise<void> {
  // Client API usually stores budgets in a directory named after their ID (groupId in this case)
  const budgetDirInClientCache = path.join(clientApiCacheBaseDir, newBudgetGroupId);

  await fs.ensureDir(budgetDirInClientCache);
  console.log(`   Copying template db.sqlite to client cache: ${path.join(budgetDirInClientCache, 'db.sqlite')}`);
  await fs.copy(path.join(templateSourceDir, 'db.sqlite'), path.join(budgetDirInClientCache, 'db.sqlite'));

  const metadataTemplatePath = path.join(templateSourceDir, 'metadata.json');
  let metadata = JSON.parse(await fs.readFile(metadataTemplatePath, 'utf8'));
  metadata.groupId = newBudgetGroupId;
  metadata.fileId = uuidv4(); // Client might also use/expect a local fileId in its metadata

  console.log(`   Writing modified metadata.json to client cache: ${path.join(budgetDirInClientCache, 'metadata.json')} with groupId: ${newBudgetGroupId}`);
  await fs.writeFile(path.join(budgetDirInClientCache, 'metadata.json'), JSON.stringify(metadata, null, 2));
}


async function main() {
  let currentApi: typeof api | null = null;
  let budgetSyncId: string = "";
  let createdTestData: TestData | null = null;

  const uniqueTestBudgetGroupId = uuidv4();
  const clientApiCacheDir = path.join(SERVER_EFFECTIVE_DATA_DIR, CLIENT_API_CACHE_SUBDIR_NAME);

  try {
    // Clear relevant directories for a clean test run
    console.log(`Cleaning server data at: ${SERVER_EFFECTIVE_DATA_DIR}`);
    await fs.emptyDir(path.join(SERVER_EFFECTIVE_DATA_DIR, 'user-files')); // Be careful with emptyDir on /tmp
    await fs.emptyDir(path.join(SERVER_EFFECTIVE_DATA_DIR, 'server-files'));
    console.log(`Cleaning client API cache at: ${clientApiCacheDir}`);
    await fs.emptyDir(clientApiCacheDir);

    console.log(`Priming server's user-files directory within: ${SERVER_EFFECTIVE_DATA_DIR}`);
    await primeServerWithBudget(TEMPLATE_BUDGET_SOURCE_DIR, SERVER_EFFECTIVE_DATA_DIR, uniqueTestBudgetGroupId);
    budgetSyncId = uniqueTestBudgetGroupId;

    currentApi = await initializeApi(clientApiCacheDir); // Pass the explicit client cache path
    console.log('API initialized.');

    console.log(`Loading budget with syncId (groupId): ${budgetSyncId}. Client will fetch from server.`);
    // Client cache is empty, so loadBudget will fetch from server.
    // Server (using SERVER_EFFECTIVE_DATA_DIR) should find the primed file.
    await currentApi.loadBudget(budgetSyncId);
    console.log(`Budget ${budgetSyncId} loaded (fetched from server to client cache).`);

    console.log('Attempting initial sync with server...');
    await currentApi.sync();
    console.log('Initial sync completed.');

    createdTestData = await setupTestData(currentApi);
    console.log('Test data setup complete.');

    assert(createdTestData, "Test data was not created successfully.");

    await runBackupTest(budgetSyncId, createdTestData);
    console.log("\nAll tests completed successfully.");
  } catch (err: unknown) {
    console.error('Error in test utilities script:', err);
    if (err instanceof Error) {
      console.error('Error name:', err.name);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      if (err.message && err.message.includes('ECONNREFUSED')) {
        console.error(`Connection refused. Ensure the Actual server is running at ${ACTUAL_SERVER_URL}.`);
        console.error("You might need to run 'devenv up' or 'nix develop' in another terminal.");
      }
    } else {
      console.error('Caught error of unknown type:', err);
    }
    process.exitCode = 1;
  } finally {
    if (currentApi) {
      // await cleanupTestData();
      console.log('Shutting down API connection for test utilities...');
      try {
        await currentApi.shutdown();
        console.log('API connection for test utilities shut down.');
      } catch (shutdownError) {
        console.error('Error during API shutdown:', shutdownError);
      }
    }
  }
}

if (require.main === module) {
  main().catch(error => {
    if (error instanceof Error) {
      console.error("Unhandled error in main execution:", error.message, error.stack);
    } else {
      console.error("Unhandled error in main execution (unknown type):", error);
    }
    process.exitCode = 1;
  });
}