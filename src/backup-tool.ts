#!/usr/bin/env node
// src/backup-tool.ts

// Use namespace import for CommonJS compatibility
import * as api from '@actual-app/api';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';
import fs from 'fs/promises'; // Import fs.promises for async file system operations
import AdmZip from 'adm-zip'; // Import AdmZip for zipping
import crypto from 'crypto'; // For creating unique names

// Define an interface for expected argument types
interface Arguments {
    syncId: string;
    backupDir: string;
    backupFilename?: string;
    _: (string | number)[]; // Positional arguments captured by yargs
    $0: string; // Script name
}

// Flag to prevent double shutdown attempts from signal handlers and finally block
let isShuttingDown = false;

// --- Main Async Function ---
(async (): Promise<void> => {
    // --- Argument Parsing ---
    const argv = await yargs(hideBin(process.argv))
        .option('sync-id', {
            alias: 's',
            type: 'string',
            description: 'Actual Budget Sync ID (UUID)',
            demandOption: true, // Makes this flag required
        })
        .option('backup-dir', {
            alias: 'd',
            type: 'string',
            description: 'Base directory for placing the final backup zip file',
            default: 'backup', // Default value if flag is not provided
        })
        .option('backup-filename', {
            alias: 'f',
            type: 'string',
            description: 'Filename to use for the final backup zip file',
            default: undefined, // Default value if flag is not provided
        })
        .usage('Usage: $0 --sync-id <uuid> [--backup-dir <path>] [--backup-filename <filename>]')
        .help() // Enable --help flag
        .alias('help', 'h')
        .strict() // Report errors for unknown options
        .parseAsync() as Arguments; // Parse arguments and assert type

    const { syncId, backupDir, backupFilename } = argv;

    // --- Environment Variable Handling ---
    const serverURL: string | undefined = process.env.SERVER_URL;
    const password: string | undefined = process.env.SERVER_PASSWORD;

    if (!serverURL) {
        console.error('Error: Environment variable SERVER_URL is not set.');
        process.exit(1);
    }
    if (!password) {
        console.error('Error: Environment variable SERVER_PASSWORD is not set.');
        process.exit(1);
    }

    console.log(`Using Sync ID: ${syncId}`);
    console.log(`Target Server URL: ${serverURL}`);
    // Avoid logging the password!

    // --- Backup Directory Preparation ---
    // 1. Resolve and verify the FINAL destination directory for the zip
    const resolvedBaseBackupDir = await resolveAndVerifyBaseDir(backupDir);

    // 2. Create a unique temporary directory INSIDE the base dir for this run's API files
    const runSpecificTempDir = await createRunSpecificTempDir(resolvedBaseBackupDir);
    console.log(`Using temporary directory for API files: ${runSpecificTempDir}`);


    let downloadedBudgetPath: string | null = null; // Path like /path/to/backup/temp_.../My-Finances-XYZ

    // --- Actual API Interaction ---
    try {
        console.log('Initializing Actual API...');
        // 3. Initialize API using the temporary directory
        await api.init({
            dataDir: runSpecificTempDir, // API uses the clean temp dir
            serverURL: serverURL,
            password: password,
        });
        console.log('API Initialized successfully.');

        console.log(`Downloading budget for Sync ID: ${syncId}...`);
        // 4. Download will place files inside runSpecificTempDir
        await api.downloadBudget(syncId);
        console.log('Budget downloaded successfully.');

        // 5. Find the actual budget folder created *inside* the temp dir
        console.log(`Locating downloaded budget folder in ${runSpecificTempDir}...`);
        downloadedBudgetPath = await findCreatedBudgetDir(runSpecificTempDir);
        if (!downloadedBudgetPath) {
            throw new Error(`Could not find the downloaded budget directory inside ${runSpecificTempDir}.`);
        }
        console.log(`Found budget folder: ${downloadedBudgetPath}`);

    } catch (error) {
        console.error('Error during Actual API operation or finding budget folder:', error);
        // Attempt to clean up the temp dir even on error before exiting
        await deleteSourceDir(runSpecificTempDir, 'temporary run directory');
        process.exit(1);
    } finally {
        // --- Shutdown API Connection ---
        if (!isShuttingDown) {
            isShuttingDown = true; // Prevent signal handlers from running shutdown again
            try {
                console.log('Shutting down Actual API connection...');
                await api.shutdown();
                console.log('API connection shut down.');
            } catch (shutdownError) {
                console.error('Error during final API shutdown:', shutdownError);
                // If shutdown fails here, we might still want to exit successfully if the main task succeeded
                // or exit with an error if shutdown is critical. Let's exit with error for now.
                // process.exit(1); // Decide if shutdown failure should cause non-zero exit
            }
        }
    }

    // --- Zipping and Cleanup (only if download succeeded and path was found) ---
    if (downloadedBudgetPath) {
        try {
            // 6. Create zip in the BASE directory, taking content from the downloaded path
            console.log(`Zipping budget folder contents from: ${downloadedBudgetPath}`);
            const zipFilePath = await createDatedZip(downloadedBudgetPath, resolvedBaseBackupDir, backupFilename);
            console.log(`Successfully created zip file: ${zipFilePath}`);

        } catch (zipError) {
            console.error('Error during zipping:', zipError);
            // Attempt cleanup before exiting
            await deleteSourceDir(runSpecificTempDir, 'temporary run directory');
            process.exit(1); // Exit with error if zipping fails
        } finally {
            // 7. Delete the entire temporary directory regardless of zip success/failure
            // (if zip failed, we still want to clean up the temp artifacts)
            await deleteSourceDir(runSpecificTempDir, 'temporary run directory');
        }
    } else {
        console.warn("Skipping zip as the downloaded budget path was not found.");
        // Clean up the temp dir even if the budget folder wasn't found within it
        await deleteSourceDir(runSpecificTempDir, 'temporary run directory');
        process.exit(1); // Exit with error because the primary goal likely failed
    }


    console.log('Backup process completed successfully.');
    process.exit(0); // Explicitly exit with success status

})().catch(err => {
    // Catch top-level errors (e.g., argument parsing, unexpected issues before try/catch)
    console.error("Script execution failed unexpectedly:", err);
    // Note: This might leave temp dirs behind in rare cases of catastrophic failure
    // before the main logic runs or if temp dir creation itself fails badly.
    process.exit(1);
});


// --- Helper Functions ---

/**
 * Resolves the base backup directory path, creates it if necessary, and verifies write access.
 * @param baseDir - The directory path specified by the user for the final zip file.
 * @returns The resolved absolute path to the base backup directory.
 */
async function resolveAndVerifyBaseDir(baseDir: string): Promise<string> {
    let resolvedPath: string;
    try {
        resolvedPath = path.resolve(baseDir);
        console.log(`Ensuring base backup directory exists: ${resolvedPath}`);
        // Ensure directory exists, creating intermediate directories if needed
        await fs.mkdir(resolvedPath, { recursive: true });
        // Check write permissions
        await fs.access(resolvedPath, fs.constants.W_OK);
        console.log(`Write access verified for base directory: ${resolvedPath}`);
    } catch (err: any) {
        console.error(`Error accessing base backup directory "${baseDir}" (resolved to "${path.resolve(baseDir)}"):`);
        // Provide more specific feedback based on common error codes
        if (err.code === 'EACCES') {
            console.error('Permission denied. Please ensure the script has write access to the directory.');
        } else if (err.code === 'ENOENT') {
            // This shouldn't happen often with recursive mkdir, but good to check
            console.error('Path component does not exist or is invalid.');
        } else {
            console.error(err.message); // General error message
        }
        process.exit(1); // Exit if directory preparation fails
    }
    return resolvedPath;
}

/**
 * Creates a unique temporary subdirectory within the base directory for API operations for this run.
 * @param baseDir - The resolved absolute path to the base backup directory.
 * @returns The absolute path to the newly created temporary directory.
 */
async function createRunSpecificTempDir(baseDir: string): Promise<string> {
    // Generate a unique name, e.g., "temp_actual_backup_abc123def"
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const tempDirName = `temp_actual_backup_${uniqueSuffix}`;
    const tempDirPath = path.join(baseDir, tempDirName);
    try {
        await fs.mkdir(tempDirPath, { recursive: true }); // Ensure it's created
        console.log(`Created temporary directory: ${tempDirPath}`);
        // Double-check write access specifically to the temp dir (usually inherited)
        await fs.access(tempDirPath, fs.constants.W_OK);
        return tempDirPath;
    } catch (error) {
        console.error(`Failed to create or access temporary directory ${tempDirPath}:`, error);
        process.exit(1); // Cannot proceed without a working temp directory
    }
}


/**
 * Finds the primary subdirectory created within the specified directory (expected to be the temp dir).
 * Assumes the API creates exactly one subdirectory for the downloaded budget.
 * @param searchDir - The absolute path to the directory to search within (the temp dir).
 * @returns The absolute path to the found budget directory, or null if none/multiple found or error.
 */
async function findCreatedBudgetDir(searchDir: string): Promise<string | null> {
    try {
        const entries = await fs.readdir(searchDir, { withFileTypes: true });
        const directories = entries.filter(entry => entry.isDirectory());

        if (directories.length === 1) {
            return path.join(searchDir, directories[0].name);
        } else if (directories.length === 0) {
            console.warn(`No subdirectories found in ${searchDir} after download.`);
            return null;
        } else {
            console.warn(`Multiple subdirectories found in ${searchDir}. Cannot reliably determine the budget folder.`);
            console.warn(`Found: ${directories.map(d => d.name).join(', ')}`);
            return null; // Or handle ambiguity differently
        }
    } catch (error) {
        console.error(`Error reading directory ${searchDir} to find budget folder:`, error);
        return null;
    }
}

/**
 * Creates a zip file named YYYY-MM-DD <FolderName>.zip in the target directory,
 * containing the contents of the source directory.
 * @param sourceDirPath - Absolute path to the directory whose contents should be zipped (e.g., the budget folder inside temp).
 * @param targetZipDir - Absolute path to the directory where the zip file should be saved (the base backup dir).
 * @returns The absolute path to the created zip file.
 */
async function createDatedZip(sourceDirPath: string, targetZipDir: string, backupFilename?: string): Promise<string> {
    const folderName = path.basename(sourceDirPath); // e.g., "My-Finances-7a1809d"
    const dateStr = getFormattedDate(new Date());
    const zipFileName = backupFilename ?? `${dateStr} ${folderName}.zip`;
    const zipFilePath = path.join(targetZipDir, zipFileName); // Place zip in the BASE dir

    console.log(`Creating zip: ${zipFilePath} from contents of ${sourceDirPath}`);

    try {
        const zip = new AdmZip();
        // Add the contents of the source directory directly into the zip root
        zip.addLocalFolder(sourceDirPath, '', (filename) => {
            // Example filter: Exclude hidden files/folders if needed
            // if (path.basename(filename).startsWith('.')) return false;
            return true;
        });
        // Write the zip file asynchronously
        await zip.writeZipPromise(zipFilePath);
        return zipFilePath;
    } catch (error) {
        console.error(`Failed to create zip file at ${zipFilePath}:`, error);
        throw error; // Re-throw to be caught by the caller
    }
}

/**
 * Deletes the specified directory recursively and forcefully.
 * @param dirPath - Absolute path to the directory to delete.
 * @param description - A descriptive name for the directory being deleted (for logging).
 */
async function deleteSourceDir(dirPath: string, description: string = 'directory'): Promise<void> {
    console.log(`Deleting ${description}: ${dirPath}`);
    try {
        await fs.rm(dirPath, { recursive: true, force: true, maxRetries: 3 }); // Added retries for robustness
        console.log(`Successfully deleted ${description}.`);
    } catch (error: any) {
        // If it doesn't exist, that's fine (already deleted or failed creation)
        if (error.code === 'ENOENT') {
            console.log(`${description} ${dirPath} not found (already deleted or failed creation).`);
            return;
        }
        // Log other errors but don't necessarily exit, especially if called during cleanup
        console.error(`Failed to delete ${description} ${dirPath}:`, error);
        // Consider if specific errors here should halt the process or just be warnings
    }
}

/**
 * Formats a Date object into a string 'YYYY-MM-DD'.
 * @param date - The Date object to format.
 * @returns The formatted date string.
 */
function getFormattedDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Handles graceful shutdown on receiving signals (SIGINT, SIGTERM).
 * Attempts to shut down the API connection before exiting.
 * @param signal - The signal received ('SIGINT' or 'SIGTERM').
 */
async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) return; // Prevent concurrent shutdowns
    isShuttingDown = true;
    console.log(`\nReceived ${signal}. Attempting graceful shutdown...`);
    try {
        // Check if API was likely initialized and shutdown exists
        if (api && typeof api.shutdown === 'function') {
            console.log('Shutting down Actual API connection via signal handler...');
            await api.shutdown();
            console.log('API connection shut down successfully via signal handler.');
        } else {
            console.log('API not initialized or shutdown function unavailable during signal handling.');
        }
    } catch (shutdownError) {
        console.error(`Error during API shutdown on ${signal}:`, shutdownError);
    } finally {
        // Exit with a non-zero code to indicate interruption
        console.log(`Exiting due to ${signal}.`);
        process.exit(1);
    }
}

// --- Signal Handlers ---
// Handle Ctrl+C
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Handle termination signals (e.g., from kill command)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
