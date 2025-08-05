#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration
const VERSIONS_FILE = path.join(__dirname, '../website/versions.json');
const PACKAGE_FILE = path.join(__dirname, '../package.json');

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

async function updateVersions() {
    try {
        // Read current versions file
        let versionsData = {};
        if (fs.existsSync(VERSIONS_FILE)) {
            const fileContent = fs.readFileSync(VERSIONS_FILE, 'utf8');
            versionsData = JSON.parse(fileContent);
        }

        // Read package.json for current version
        const packageData = JSON.parse(fs.readFileSync(PACKAGE_FILE, 'utf8'));
        const currentVersion = packageData.version;

        console.log(`Current version in package.json: ${currentVersion}`);
        console.log(`Last version in versions.json: ${versionsData.version || 'None'}`);

        // Get new version
        const newVersion = await askQuestion(`Enter new version (default: ${currentVersion}): `) || currentVersion;

        // Get release date
        const releaseDate = await askQuestion(`Enter release date (YYYY-MM-DD, default: today): `) ||
            new Date().toISOString().split('T')[0];

        // Get changelog entries
        const changelog = [];
        console.log('Enter changelog entries (one per line, empty line to finish):');
        while (true) {
            const entry = await askQuestion('> ');
            if (!entry.trim()) break;
            changelog.push(entry.trim());
        }

        // Confirm changes
        console.log('\n--- Summary ---');
        console.log(`Version: ${newVersion}`);
        console.log(`Release date: ${releaseDate}`);
        console.log('Changelog:');
        changelog.forEach(item => console.log(`  - ${item}`));

        const confirm = await askQuestion('\nConfirm update? (y/N): ');
        if (confirm.toLowerCase() !== 'y') {
            console.log('Update cancelled.');
            rl.close();
            return;
        }

        // Update download URLs with new version
        const downloads = {
            macos: {
                url: `/downloads/cindy-macos-${newVersion}.dmg`,
                fileName: `cindy-macos-${newVersion}.dmg`,
                fileSize: versionsData.downloads?.macos?.fileSize || 'Unknown',
                checksum: versionsData.downloads?.macos?.checksum || ''
            },
            windows: {
                url: `/downloads/cindy-windows-${newVersion}.exe`,
                fileName: `cindy-windows-${newVersion}.exe`,
                fileSize: versionsData.downloads?.windows?.fileSize || 'Unknown',
                checksum: versionsData.downloads?.windows?.checksum || ''
            },
            linux: {
                url: `/downloads/cindy-linux-${newVersion}.AppImage`,
                fileName: `cindy-linux-${newVersion}.AppImage`,
                fileSize: versionsData.downloads?.linux?.fileSize || 'Unknown',
                checksum: versionsData.downloads?.linux?.checksum || ''
            }
        };

        // Create new versions data
        const newVersionsData = {
            version: newVersion,
            releaseDate: releaseDate,
            changelog: changelog,
            downloads: downloads
        };

        // Write to versions.json
        fs.writeFileSync(VERSIONS_FILE, JSON.stringify(newVersionsData, null, 2));
        console.log(`\nSuccessfully updated ${VERSIONS_FILE}`);

        // Update package.json version if different
        if (currentVersion !== newVersion) {
            packageData.version = newVersion;
            fs.writeFileSync(PACKAGE_FILE, JSON.stringify(packageData, null, 2));
            console.log(`Updated version in ${PACKAGE_FILE} to ${newVersion}`);
        }

        rl.close();

    } catch (error) {
        console.error('Error updating versions:', error);
        rl.close();
        process.exit(1);
    }
}

// Run the update process
updateVersions();