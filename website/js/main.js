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

// Function to highlight the current page in navigation
function highlightCurrentPage() {
    const currentPage = window.location.pathname.split('/').pop();
    const navLinks = document.querySelectorAll('.main-nav .nav-links a');

    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        // Handle index.html as the default page
        const page = href === '' || href === 'index.html' ? 'index.html' : href;

        if (currentPage === page) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        } else {
            link.classList.remove('active');
            link.removeAttribute('aria-current');
        }
    });
}

// Initialize navigation highlighting
if (document.querySelector('.main-nav')) {
    highlightCurrentPage();
}

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        updateDownloadPage,
        setupDownloadAnalytics
    };
}
// Cookie Consent Functionality has been replaced with cookieconsent library

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
// Initialize cookie consent with Osano's cookieconsent library
if (typeof cookieconsent !== 'undefined') {
    cookieconsent.initialise({
        palette: {
            popup: {
                background: '#1a1a1a',
                text: '#ffffff'
            },
            button: {
                background: '#7c3aed',
                text: '#ffffff'
            },
            highlight: {
                background: '#0066cc',
                text: '#ffffff'
            }
        },
        theme: 'classic',
        theme: 'classic',
        type: 'opt-in',
        content: {
            header: 'Cookies used on the website!',
            message: 'We use cookies to enhance your experience, analyze site usage, and integrate with social media. By clicking "Allow", you consent to our use of cookies as described in our <a href="privacy.html" target="_blank">Privacy Policy</a>.',
            allow: 'Allow',
            deny: 'Decline',
            link: 'Learn more',
            href: 'privacy.html'
        },
        position: 'bottom',
        static: false,
        dismissOnScroll: false,
        dismissOnTimeout: false,
        dismissOnWindowClick: false,
        onInitialise: function (status) {
            var type = this.options.type;
            var didConsent = this.hasConsent();
            if (type === 'opt-in' && didConsent) {
                // Load cookies since user has consented
                loadCookies();
            }
            if (type === 'opt-out' && !didConsent) {
                // Disable cookies since user has opted out
                disableCookies();
            }
        },
        onStatusChange: function (status, chosenBefore) {
            var type = this.options.type;
            var didConsent = this.hasConsent();
            if (type === 'opt-in' && didConsent) {
                // Load cookies since user has consented
                loadCookies();
            }
            if (type === 'opt-out' && !didConsent) {
                // Disable cookies since user has opted out
                disableCookies();
            }
        },
        onRevokeChoice: function () {
            // User has revoked their choice, disable cookies
            disableCookies();
        }
    });
}

// Function to load cookies based on user consent
function loadCookies() {
    // Load Google Analytics
    if (!window.gtag) {
        var script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID';
        document.head.appendChild(script);

        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', 'GA_MEASUREMENT_ID');
    }

    // Load marketing scripts
    console.log('Loading marketing scripts based on user consent');
}

// Function to disable cookies
function disableCookies() {
    // Remove any tracking scripts
    var scripts = document.querySelectorAll('script[src*="googletagmanager"], script[src*="facebook"], script[src*="google-analytics"]');
    scripts.forEach(function (script) {
        script.remove();
    });

    // Clear any tracking cookies
    var cookies = document.cookie.split(";");
    for (var i = 0; i < cookies.length; i++) {
        var cookie = cookies[i];
        var eqPos = cookie.indexOf("=");
        var name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    }
}
// Technology Carousel Functionality
document.addEventListener('DOMContentLoaded', function () {
    const carousel = document.querySelector('.tech-carousel');
    if (!carousel) return;

    const track = carousel.querySelector('.carousel-track');
    const cards = carousel.querySelectorAll('.tech-card');
    const prevBtn = carousel.querySelector('.carousel-btn.prev');
    const nextBtn = carousel.querySelector('.carousel-btn.next');
    const cardWidth = 300;
    const gap = 20;
    const visibleCards = Math.floor(carousel.querySelector('.carousel-container').offsetWidth / (cardWidth + gap));
    const totalCards = cards.length;
    let currentIndex = 0;

    // Update button states
    function updateButtons() {
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex >= totalCards - visibleCards;
    }

    // Move to specific slide
    function goToSlide(index) {
        if (index < 0 || index > totalCards - visibleCards) return;

        currentIndex = index;
        track.style.transform = `translateX(-${(cardWidth + gap) * currentIndex}px)`;
        updateButtons();
    }

    // Event listeners for buttons
    prevBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
    nextBtn.addEventListener('click', () => goToSlide(currentIndex + 1));

    // Learn more buttons
    const learnMoreBtns = carousel.querySelectorAll('.learn-more-btn');
    learnMoreBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const details = this.nextElementSibling;
            const isExpanded = this.getAttribute('aria-expanded') === 'true';

            this.setAttribute('aria-expanded', !isExpanded);
            details.hidden = isExpanded;
        });
    });

    // Initialize
    updateButtons();

    // Handle window resize
    window.addEventListener('resize', () => {
        const newVisibleCards = Math.floor(carousel.querySelector('.carousel-container').offsetWidth / (cardWidth + gap));
        if (newVisibleCards !== visibleCards) {
            goToSlide(currentIndex);
        }
    });
});