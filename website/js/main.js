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

// Function to handle blog post "Read More" functionality
function setupReadMore() {
    const readMoreButtons = document.querySelectorAll('.read-more');

    readMoreButtons.forEach(button => {
        button.addEventListener('click', function (e) {
            e.preventDefault();
            const postContent = this.closest('.post-content');
            const isExpanded = this.getAttribute('data-expanded') === 'true';

            if (isExpanded) {
                // Collapse the content
                postContent.style.maxHeight = '200px';
                this.textContent = 'Read More';
                this.setAttribute('data-expanded', 'false');
            } else {
                // Expand the content
                postContent.style.maxHeight = 'none';
                this.textContent = 'Read Less';
                this.setAttribute('data-expanded', 'true');
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

    // Setup blog post read more functionality
    setupReadMore();
});

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        updateDownloadPage,
        setupDownloadAnalytics
    };
}
// Cookie Consent Functionality
class CookieConsent {
    constructor() {
        this.cookieBanner = document.getElementById('cookie-consent');
        this.cookieModal = document.getElementById('cookie-modal');
        this.acceptButton = document.getElementById('cookie-accept');
        this.settingsButton = document.getElementById('cookie-settings');
        this.closeModalButton = document.getElementById('close-modal');
        this.savePreferencesButton = document.getElementById('save-preferences');
        this.analyticsCheckbox = document.getElementById('analytics-cookies');
        this.marketingCheckbox = document.getElementById('marketing-cookies');

        this.init();
    }

    init() {
        // Check if user has already made a choice
        if (this.hasConsent()) {
            this.hideBanner();
            this.loadPreferences();
        } else {
            this.showBanner();
        }

        // Set up event listeners
        this.acceptButton.addEventListener('click', () => this.acceptAll());
        this.settingsButton.addEventListener('click', () => this.openModal());
        this.closeModalButton.addEventListener('click', () => this.closeModal());
        this.savePreferencesButton.addEventListener('click', () => this.savePreferences());

        // Close modal when clicking outside
        this.cookieModal.addEventListener('click', (e) => {
            if (e.target === this.cookieModal) {
                this.closeModal();
            }
        });
    }

    hasConsent() {
        return localStorage.getItem('cookie-consent') !== null;
    }

    showBanner() {
        if (this.cookieBanner) {
            this.cookieBanner.classList.remove('hidden');
        }
    }

    hideBanner() {
        if (this.cookieBanner) {
            this.cookieBanner.classList.add('hidden');
        }
    }

    openModal() {
        if (this.cookieModal) {
            this.cookieModal.classList.add('active');
            // Prevent body scrolling when modal is open
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal() {
        if (this.cookieModal) {
            this.cookieModal.classList.remove('active');
            // Restore body scrolling
            document.body.style.overflow = '';
        }
    }

    acceptAll() {
        // Set all preferences to true
        const preferences = {
            necessary: true,
            analytics: true,
            marketing: true,
            timestamp: new Date().toISOString()
        };

        // Save to localStorage
        localStorage.setItem('cookie-consent', JSON.stringify(preferences));

        // Hide banner
        this.hideBanner();

        // Load tracking scripts if accepted
        this.loadTrackingScripts(preferences);

        // Dispatch event for other scripts to listen to
        document.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: preferences }));
    }

    savePreferences() {
        const preferences = {
            necessary: true,
            analytics: this.analyticsCheckbox.checked,
            marketing: this.marketingCheckbox.checked,
            timestamp: new Date().toISOString()
        };

        // Save to localStorage
        localStorage.setItem('cookie-consent', JSON.stringify(preferences));

        // Hide banner and modal
        this.hideBanner();
        this.closeModal();

        // Load tracking scripts based on preferences
        this.loadTrackingScripts(preferences);

        // Dispatch event for other scripts to listen to
        document.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: preferences }));
    }

    loadPreferences() {
        try {
            const saved = localStorage.getItem('cookie-consent');
            if (saved) {
                const preferences = JSON.parse(saved);

                // Set checkbox states
                if (this.analyticsCheckbox) {
                    this.analyticsCheckbox.checked = preferences.analytics;
                }
                if (this.marketingCheckbox) {
                    this.marketingCheckbox.checked = preferences.marketing;
                }

                // Load tracking scripts based on saved preferences
                this.loadTrackingScripts(preferences);
            }
        } catch (e) {
            console.error('Error loading cookie preferences:', e);
        }
    }

    loadTrackingScripts(preferences) {
        // This is where you would load your tracking scripts based on user preferences
        // For example:

        if (preferences.analytics) {
            // Load Google Analytics or other analytics tools
            this.loadGoogleAnalytics();
        }

        if (preferences.marketing) {
            // Load Facebook Pixel, Google Ads, etc.
            this.loadMarketingScripts();
        }
    }

    loadGoogleAnalytics() {
        // Example of loading Google Analytics only when user consents
        if (!window.gtag) {
            // Create script element for Google Analytics
            const script = document.createElement('script');
            script.async = true;
            script.src = 'https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID';
            document.head.appendChild(script);

            // Initialize gtag
            window.dataLayer = window.dataLayer || [];
            function gtag() { dataLayer.push(arguments); }
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', 'GA_MEASUREMENT_ID');
        }
    }

    loadMarketingScripts() {
        // Placeholder for marketing scripts
        // This would include Facebook Pixel, LinkedIn Insight, etc.
        console.log('Loading marketing scripts based on user consent');
    }
}

// Initialize cookie consent when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Existing initialization code...
    if (document.querySelector('.download-options')) {
        updateDownloadPage();
    }

    setupDownloadAnalytics();
    setupReadMore();

    // Initialize cookie consent
    if (document.getElementById('cookie-consent')) {
        window.cookieConsent = new CookieConsent();
    }
});