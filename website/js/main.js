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
    setupMobileMenu();
    highlightCurrentPage();
    
    // Initialize modern interactive features
    initScrollAnimations();
    initParallaxEffect();
    initNavbarScroll();
    initTypingEffect();
    initCookieConsent();
});

// Function to handle mobile menu toggle
function setupMobileMenu() {
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    const body = document.body;

    if (!navToggle || !navLinks) return;

    // Toggle mobile menu
    navToggle.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        
        const isActive = navLinks.classList.contains('active');
        
        if (isActive) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    });

    function openMobileMenu() {
        navLinks.classList.add('active');
        navToggle.setAttribute('aria-expanded', 'true');
        body.style.overflow = 'hidden'; // Prevent scrolling when menu is open
    }

    function closeMobileMenu() {
        navLinks.classList.remove('active');
        navToggle.setAttribute('aria-expanded', 'false');
        body.style.overflow = ''; // Re-enable scrolling
    }

    // Close mobile menu when clicking on a link
    const navLinksList = document.querySelectorAll('.nav-links a');
    navLinksList.forEach(link => {
        link.addEventListener('click', () => {
            closeMobileMenu();
        });
    });

    // Close mobile menu when clicking outside
    document.addEventListener('click', function (e) {
        if (navLinks.classList.contains('active') && 
            !navToggle.contains(e.target) && 
            !navLinks.contains(e.target)) {
            closeMobileMenu();
        }
    });
    
    // Close menu on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && navLinks.classList.contains('active')) {
            closeMobileMenu();
        }
    });
}

// Function to highlight the current page in navigation
function highlightCurrentPage() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-links a');

    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        const page = href === '' || href === 'index.html' ? 'index.html' : href;

        if (currentPage === page || (currentPage === '' && page === 'index.html')) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        } else {
            link.classList.remove('active');
            link.removeAttribute('aria-current');
        }
    });
}

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        updateDownloadPage,
        setupDownloadAnalytics
    };
}
// Simple Cookie Consent Implementation
function initCookieConsent() {
    const banner = document.getElementById('cookie-consent-banner');
    const acceptBtn = document.getElementById('cookie-accept');
    const declineBtn = document.getElementById('cookie-decline');
    
    if (!banner || !acceptBtn || !declineBtn) {
        console.warn('Cookie consent elements not found');
        return;
    }

    // Check if user has already made a choice
    const hasConsent = localStorage.getItem('cookieConsent');
    if (hasConsent === null) {
        // Show banner after a delay to ensure page is loaded
        setTimeout(() => {
            banner.classList.remove('hidden');
        }, 1000);
    }

    // Handle accept button click
    acceptBtn.addEventListener('click', function() {
        localStorage.setItem('cookieConsent', 'accepted');
        hideBanner();
        loadCookies();
        
        // Show confirmation
        showNotification('✅ Cookie preferences saved', 'success');
    });

    // Handle decline button click
    declineBtn.addEventListener('click', function() {
        localStorage.setItem('cookieConsent', 'declined');
        hideBanner();
        disableCookies();
        
        // Show confirmation
        showNotification('❌ Cookies declined', 'info');
    });

    function hideBanner() {
        banner.classList.add('hidden');
        // Remove from DOM after animation
        setTimeout(() => {
            if (banner.parentNode) {
                banner.style.display = 'none';
            }
        }, 400);
    }
}

// Function to show notification
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : '#6366f1'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10001;
        font-weight: 500;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// Function to load cookies based on user consent
function loadCookies() {
    console.log('Loading analytics and marketing scripts based on user consent');
    
    // Example: Load Google Analytics (replace GA_MEASUREMENT_ID with actual ID)
    if (!window.gtag && typeof GA_MEASUREMENT_ID !== 'undefined') {
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
        document.head.appendChild(script);

        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', GA_MEASUREMENT_ID);
    }
}

// Function to disable cookies
function disableCookies() {
    console.log('Disabling tracking cookies and scripts');
    
    // Remove tracking scripts
    const scripts = document.querySelectorAll('script[src*="googletagmanager"], script[src*="google-analytics"], script[src*="gtag"]');
    scripts.forEach(script => script.remove());
    
    // Clear tracking cookies
    const cookies = document.cookie.split(';');
    cookies.forEach(cookie => {
        const eqPos = cookie.indexOf('=');
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        if (name.startsWith('_ga') || name.startsWith('_gtag') || name.startsWith('_gid')) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${window.location.hostname}`;
        }
    });
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

// Modern interactive features
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);

    // Observe all feature cards and other elements
    document.querySelectorAll('.feature-card, .workflow-card, .step, .download-btn').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(15px)';
        el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        observer.observe(el);
    });
}

function initParallaxEffect() {
    const hero = document.querySelector('.hero');
    if (!hero) return;

    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const rate = scrolled * -0.3;
        hero.style.backgroundPosition = `center ${rate}px`;
    });
}

function initNavbarScroll() {
    const nav = document.querySelector('.main-nav');
    if (!nav) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            nav.classList.add('scrolled');
            nav.style.background = 'rgba(255, 255, 255, 0.98)';
            nav.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
        } else {
            nav.classList.remove('scrolled');
            nav.style.background = 'rgba(255, 255, 255, 0.95)';
            nav.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
        }
    });
}

function initTypingEffect() {
    // Disabled typing effect for less distracting experience
    // The text will appear normally with CSS animations
    return;
}

// Add smooth hover effects and ripple effect
document.addEventListener('DOMContentLoaded', function() {
    const buttons = document.querySelectorAll('.btn, .download-btn');
    
    buttons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
        
        // Add ripple effect
        if (button.classList.contains('btn-primary') || button.classList.contains('download-btn')) {
            button.addEventListener('click', addRippleEffect);
        }
    });
});

function addRippleEffect(e) {
    const button = e.currentTarget;
    const ripple = document.createElement('span');
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s linear;
        pointer-events: none;
        z-index: 0;
    `;
    
    button.style.position = 'relative';
    button.style.overflow = 'hidden';
    button.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes ripple {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    .animate-in {
        animation: bounceIn 0.8s ease-out;
    }
    
    @media (prefers-reduced-motion: reduce) {
        * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
        }
    }
`;
document.head.appendChild(style);