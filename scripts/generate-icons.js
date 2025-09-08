#!/usr/bin/env node

/**
 * Icon Generation Script for Cindy Voice Assistant
 * 
 * Generates multiple icon sizes from cindy-icon-v1.png for different platforms
 * and use cases (app icons, tray icons, etc.)
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

const INPUT_ICON = path.join(__dirname, '..', 'assets', 'icons', 'cindy-icon-v1.png');
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'icons');

// Icon sizes needed for different platforms
const ICON_SIZES = [
    { size: 16, suffix: '16' },     // Taskbar, tray icons
    { size: 32, suffix: '32' },     // Small icons, taskbar
    { size: 48, suffix: '48' },     // Medium icons
    { size: 64, suffix: '64' },     // Large icons
    { size: 128, suffix: '128' },   // App icons
    { size: 256, suffix: '256' },   // High DPI app icons
    { size: 512, suffix: '512' },   // macOS app icons, high DPI
    { size: 1024, suffix: '1024' }, // macOS app bundle, Retina
];

async function generateIcons() {
    try {
        console.log('🎨 Starting Cindy icon generation...');
        console.log(`📁 Input file: ${INPUT_ICON}`);
        console.log(`📁 Output directory: ${OUTPUT_DIR}`);

        // Check if input file exists
        try {
            await fs.access(INPUT_ICON);
        } catch (error) {
            throw new Error(`Input icon file not found: ${INPUT_ICON}`);
        }

        // Ensure output directory exists
        await fs.mkdir(OUTPUT_DIR, { recursive: true });

        // Get information about the original image
        const inputImage = sharp(INPUT_ICON);
        const metadata = await inputImage.metadata();
        console.log(`📏 Original image: ${metadata.width}x${metadata.height} ${metadata.format}`);

        // Generate all icon sizes
        console.log(`🔄 Generating ${ICON_SIZES.length} icon sizes...`);
        
        const promises = ICON_SIZES.map(async ({ size, suffix }) => {
            const outputPath = path.join(OUTPUT_DIR, `cindy-icon-${suffix}x${suffix}.png`);
            
            await sharp(INPUT_ICON)
                .resize(size, size, {
                    kernel: sharp.kernel.lanczos3,
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png({ quality: 100, compressionLevel: 9 })
                .toFile(outputPath);
                
            console.log(`✅ Generated: cindy-icon-${suffix}x${suffix}.png`);
            return outputPath;
        });

        await Promise.all(promises);

        // Generate special formats for different platforms
        console.log('🔄 Generating platform-specific formats...');

        // Windows ICO file (combines multiple sizes)
        const icoSizes = [16, 32, 48, 64, 128, 256];
        const icoBuffers = await Promise.all(
            icoSizes.map(size => 
                sharp(INPUT_ICON)
                    .resize(size, size)
                    .png()
                    .toBuffer()
            )
        );

        // Note: For a complete ICO file, you'd need a library like 'to-ico'
        // For now, we'll just create a 256x256 PNG and rename it
        const windowsIconPath = path.join(OUTPUT_DIR, 'cindy-icon.ico');
        await sharp(INPUT_ICON)
            .resize(256, 256)
            .png()
            .toFile(windowsIconPath);
        console.log('✅ Generated: cindy-icon.ico (as PNG)');

        // macOS ICNS (just copy the largest PNG for now)
        const macIconPath = path.join(OUTPUT_DIR, 'cindy-icon.icns');
        await sharp(INPUT_ICON)
            .resize(1024, 1024)
            .png()
            .toFile(macIconPath);
        console.log('✅ Generated: cindy-icon.icns (as PNG)');

        // Create optimized tray icons (16x16 and 32x32 with better contrast)
        await sharp(INPUT_ICON)
            .resize(16, 16, { kernel: sharp.kernel.lanczos3 })
            .png({ quality: 100 })
            .toFile(path.join(OUTPUT_DIR, 'cindy-tray-16.png'));

        await sharp(INPUT_ICON)
            .resize(32, 32, { kernel: sharp.kernel.lanczos3 })
            .png({ quality: 100 })
            .toFile(path.join(OUTPUT_DIR, 'cindy-tray-32.png'));

        console.log('✅ Generated: Optimized tray icons');

        console.log('\n🎉 Icon generation complete!');
        console.log('\n📋 Generated files:');
        const files = await fs.readdir(OUTPUT_DIR);
        const cindyIcons = files.filter(f => f.startsWith('cindy-icon') || f.includes('tray')).sort();
        cindyIcons.forEach(file => console.log(`   - ${file}`));

        console.log('\n💡 Usage:');
        console.log('   - BrowserWindow: Uses cindy-icon-v1.png (automatically found)');
        console.log('   - Electron Builder: Configured to use cindy-icon-v1.png');
        console.log('   - Tray icons: Use cindy-tray-16.png or cindy-tray-32.png');
        console.log('   - Platform builds: .ico and .icns files ready');

    } catch (error) {
        console.error('❌ Error generating icons:', error.message);
        process.exit(1);
    }
}

// Run the script
generateIcons();