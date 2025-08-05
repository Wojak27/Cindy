// Function to fetch version information and update download page
async function updateDownloadPage() {
    try {
        const response = await fetch('/versions.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const versionData = await response.json();

        // Update version number across the page
        const versionElements = document.querySelectorAll('#version-number');
        versionElements.forEach(element => {
            element.textContent = versionData.version;
        });

        // Update download links with current version
        const downloadButtons = document.querySelectorAll('.download-btn');
        downloadButtons.forEach(button => {
            const platform = button.getAttribute('data-platform');
            if (platform && versionData.downloads[platform]) {
                button.href = versionData.downloads[platform].url;

                // Update button text to include file size
                const fileSize = versionData.downloads[platform].fileSize;
                const platformText = button.textContent.replace('Download for ', '');
                button.innerHTML = `
                    <div class="btn-text">
                        <div class="btn-platform">Download for ${platformText}</div>
                        <div class="btn-label">${versionData.version} • ${fileSize}</div>
                    </div>
                `;
            }
        });

        // Update release date in FAQ
        const releaseDateElement = document.querySelector('#release-date');
        if (releaseDateElement) {
            releaseDateElement.textContent = new Date(versionData.releaseDate).toLocaleDateString();
        }

        // Update changelog
        const changelogElement = document.querySelector('#changelog');
        if (changelogElement && versionData.changelog) {
            changelogElement.innerHTML = versionData.changelog
                .map(item => `<li>${item}</li>`)
                .join('');
        }

    } catch (error) {
        console.error('Error loading version information:', error);

        // Fallback to static content if JSON fetch fails
        const versionElements = document.querySelectorAll('#version-number');
        versionElements.forEach(element => {
            element.textContent = '1.2.0';
        });
    }
}

// Function to handle download button clicks for analytics
function setupDownloadAnalytics() {
    const downloadButtons = document.querySelectorAll('.download-btn');
    downloadButtons.forEach(button => {
        button.addEventListener('click', function (e) {
            const platform = this.getAttribute('data-platform');

            // Optional: Send download event to analytics
            if (typeof gtag !== 'undefined') {
                gtag('event', 'download', {
                    'event_category': 'engagement',
                    'event_label': platform,
                    'value': 1
                });
            }

            // Optional: Track download in other analytics services
            if (typeof analytics !== 'undefined') {
                analytics.track('Download Initiated', {
                    platform: platform,
                    version: document.querySelector('#version-number')?.textContent || 'unknown'
                });
            }
        });
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Update download page content if on the download page
    if (document.querySelector('.download-options')) {
        updateDownloadPage();
    }

    // Setup download analytics
    setupDownloadAnalytics();
});

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        updateDownloadPage,
        setupDownloadAnalytics
    };
}