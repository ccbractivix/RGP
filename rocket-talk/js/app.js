/* ===== RESET & BASE ===== */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Calibri', 'Gill Sans', 'Trebuchet MS', sans-serif;
    background-color: #ffffff;
    color: #1a1a2e;
    line-height: 1.6;
    min-height: 100vh;
}

a {
    color: #1565c0;
    text-decoration: none;
}

a:hover {
    text-decoration: underline;
}

/* ===== LOADING SCREEN ===== */
.loading-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    transition: opacity 0.5s ease;
}

.loading-screen.fade-out {
    opacity: 0;
    pointer-events: none;
}

.loading-rocket {
    font-size: 3rem;
    animation: bounce-rocket 1s ease-in-out infinite;
}

@keyframes bounce-rocket {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-20px); }
}

.loading-screen p {
    margin-top: 1rem;
    font-size: 1.1rem;
    color: #1a1a2e;
    font-weight: 600;
}

/* ===== HEADER ===== */
.site-header {
    background: linear-gradient(135deg, #1a1a2e, #16213e);
    color: white;
    padding: 1rem 1.5rem;
    text-align: center;
    position: sticky;
    top: 0;
    z-index: 1000;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.header-top {
    font-size: 0.85rem;
    opacity: 0.9;
    margin-bottom: 0.25rem;
    font-weight: 400;
}

.site-header h1 {
    font-size: 1.8rem;
    font-weight: 700;
    letter-spacing: 1px;
}

/* ===== MAIN CONTAINER ===== */
.launches-container {
    max-width: 700px;
    margin: 1.5rem auto;
    padding: 0 1rem;
}

/* ===== LAUNCH CARD ===== */
.launch-card {
    background: #f5f5f5;
    border-radius: 12px;
    border: 2px solid #1a1a2e;
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.15);
    margin-bottom: 1.5rem;
    overflow: hidden;
}

/* ===== LAUNCH IMAGE ===== */
.launch-image {
    width: 100%;
    max-height: 300px;
    object-fit: contain;
    background: #e0e0e0;
    display: block;
}

/* ===== HEADLINE BANNER ===== */
.cms-headline {
    background: linear-gradient(135deg, #c62828, #b71c1c);
    color: white;
    padding: 0.6rem 1rem;
    font-weight: 700;
    font-size: 1.1rem;
    text-align: center;
    font-family: 'Calibri', 'Gill Sans', 'Trebuchet MS', sans-serif;
}

/* ===== LAUNCH CONTENT ===== */
.launch-content {
    padding: 1rem 1.25rem 1.25rem;
}

/* ===== LAUNCH HEADER ===== */
.launch-name {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1a1a2e;
    margin-bottom: 0.25rem;
    font-family: 'Calibri', 'Gill Sans', 'Trebuchet MS', sans-serif;
}

.launch-vehicle {
    font-size: 1.2rem;
    font-weight: 600;
    color: #333;
    margin-bottom: 0.25rem;
    font-family: 'Calibri', 'Gill Sans', 'Trebuchet MS', sans-serif;
}

.launch-pad {
    font-size: 0.95rem;
    color: #555;
    margin-bottom: 0.25rem;
}

.launch-time {
    font-size: 0.95rem;
    color: #555;
    margin-bottom: 0.5rem;
}

/* ===== STATUS BADGE ===== */
.status-badge {
    display: inline-block;
    padding: 0.35rem 1rem;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 700;
    color: white;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-family: 'Calibri', 'Gill Sans', 'Trebuchet MS', sans-serif;
}

.status-go {
    background: #2e7d32;
}

.status-tbd {
    background: #f57c00;
}

.status-tbc {
    background: #0288d1;
}

.status-hold {
    background: #c62828;
}

.status-inflight {
    background: #283593;
}

.status-success {
    background: #2e7d32;
}

.status-failure {
    background: #c62828;
}

/* ===== COUNTDOWN CLOCK ===== */
.countdown-container {
    background: #e8eaf6;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-top: 0.75rem;
    text-align: center;
    font-family: 'Calibri', 'Gill Sans', 'Trebuchet MS', sans-serif;
    font-weight: 700;
}

.countdown-dormant {
    color: #666;
    font-size: 1.2rem;
}

.countdown-active {
    color: #c62828;
    font-size: 1.6rem;
}

.countdown-launched {
    color: #2e7d32;
    font-size: 1.4rem;
}

/* ===== DROPDOWN BASE ===== */
.dropdown {
    margin-top: 0.75rem;
    border-radius: 8px;
    overflow: hidden;
}

.dropdown summary {
    padding: 0.65rem 1rem;
    font-weight: 700;
    font-size: 0.95rem;
    color: white;
    cursor: pointer;
    list-style: none;
    border-radius: 8px;
    font-family: 'Calibri', 'Gill Sans', 'Trebuchet MS', sans-serif;
    user-select: none;
}

.dropdown summary::-webkit-details-marker {
    display: none;
}

.dropdown summary::after {
    content: ' ▸';
    float: right;
    transition: transform 0.2s ease;
}

.dropdown[open] summary::after {
    transform: rotate(90deg);
}

.dropdown[open] summary {
    border-radius: 8px 8px 0 0;
}

.dropdown-content {
    padding: 0.75rem 1rem;
    font-size: 0.95rem;
    line-height: 1.6;
    border-radius: 0 0 8px 8px;
}

/* ===== VIEWING GUIDE DROPDOWN (Green) ===== */
.viewing-guide-dropdown summary {
    background: linear-gradient(135deg, #2e7d32, #1b5e20);
}

.viewing-guide-dropdown .dropdown-content {
    background: #e8f5e9;
    color: #1b5e20;
}

.viewing-guide-link {
    display: block;
    text-align: center;
    color: #2e7d32;
    font-family: 'Calibri', 'Gill Sans', 'Trebuchet MS', sans-serif;
    font-weight: 700;
    font-size: 1.1rem;
    text-decoration: none;
    padding: 0.5rem;
}

.viewing-guide-link:hover {
    text-decoration: underline;
}

/* ===== ROCKET TALK LIVE DROPDOWN (Purple) ===== */
.rocket-talk-dropdown summary {
    background: linear-gradient(135deg, #7b1fa2, #4a148c);
}

.rocket-talk-dropdown .dropdown-content {
    background: #f3e5f5;
    color: #4a148c;
}

/* ===== CHRIS SAYS DROPDOWN (Orange) ===== */
.chris-says-dropdown summary {
    background: linear-gradient(135deg, #f57c00, #e65100);
}

.chris-says-dropdown .dropdown-content {
    background: #fff8e1;
    color: #e65100;
}

.chris-icon {
    width: 24px;
    height: 24px;
    vertical-align: middle;
    margin-right: 0.25rem;
    border-radius: 50%;
}

/* ===== MISSION INFO DROPDOWN (Blue) ===== */
.mission-info-dropdown summary {
    background: linear-gradient(135deg, #1565c0, #0d47a1);
}

.mission-info-dropdown .dropdown-content {
    background: #e3f2fd;
    color: #0d47a1;
}

/* ===== LIVESTREAM DROPDOWN (Red) ===== */
.livestream-dropdown summary {
    background: linear-gradient(135deg, #c62828, #b71c1c);
}

.livestream-dropdown .dropdown-content {
    background: #ffebee;
    color: #b71c1c;
}

.livestream-dropdown a {
    display: block;
    color: #c62828;
    font-weight: 600;
    padding: 0.3rem 0;
}

.livestream-dropdown a:hover {
    text-decoration: underline;
}

/* ===== FILMSTRIP GALLERY ===== */
.filmstrip-container {
    margin-top: 0.75rem;
    overflow-x: auto;
    white-space: nowrap;
    padding-bottom: 0.5rem;
    -webkit-overflow-scrolling: touch;
}

.filmstrip-container img {
    height: 120px;
    border-radius: 6px;
    margin-right: 0.5rem;
    display: inline-block;
    object-fit: cover;
    cursor: pointer;
    transition: transform 0.2s ease;
}

.filmstrip-container img:hover {
    transform: scale(1.05);
}

.gallery-link {
    display: block;
    text-align: center;
    color: #1565c0;
    font-size: 0.9rem;
    font-weight: 600;
    margin-top: 0.35rem;
}

/* ===== FOOTER ===== */
.site-footer {
    text-align: center;
    padding: 1.5rem 1rem;
    font-size: 0.8rem;
    color: #888;
    border-top: 1px solid #e0e0e0;
    margin-top: 2rem;
}

/* ===== ERROR STATE ===== */
.error-message {
    text-align: center;
    padding: 2rem;
    color: #c62828;
    font-weight: 600;
    font-size: 1.1rem;
}

/* ===== NO LAUNCHES STATE ===== */
.no-launches {
    text-align: center;
    padding: 3rem 1rem;
    color: #666;
    font-size: 1.1rem;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 600px) {
    .site-header h1 {
        font-size: 1.4rem;
    }

    .header-top {
        font-size: 0.75rem;
    }

    .launch-name {
        font-size: 1.25rem;
    }

    .launch-vehicle {
        font-size: 1.05rem;
    }

    .launches-container {
        padding: 0 0.5rem;
    }

    .launch-content {
        padding: 0.75rem 1rem 1rem;
    }

    .countdown-active {
        font-size: 1.3rem;
    }

    .countdown-dormant {
        font-size: 1rem;
    }

    .status-badge {
        font-size: 0.75rem;
        padding: 0.3rem 0.75rem;
    }
}
