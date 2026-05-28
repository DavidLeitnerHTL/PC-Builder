const CONFIG = {
    GEMINI_API_KEY: "GEMINI_API_KEY",
    API_BASE_URL: "https://db.pc-builder.at"
};

function getCurrentPage() {
    const path = window.location.pathname;
    const page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    return page.toLowerCase();
}

function renderHeader() {
    const currentPage = getCurrentPage();
    const isActive = (href) => currentPage === href.toLowerCase() ? 'active' : '';
    const toolPages = ['compare.html', 'bottleneck.html', 'budget.html'];
    const isToolActive = toolPages.includes(currentPage) ? 'active' : '';

    return `
  <header>
    <div class="container">
      <nav class="navbar navbar-expand-lg p-0">
        <a class="navbar-brand d-flex align-items-center gap-2" href="index.html">
          <i class="fas fa-microchip fa-lg"></i>
          <span>PC Builder</span>
        </a>
        <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="nav nav-pills ms-auto gap-1 align-items-center">
            <li class="nav-item"><a class="nav-link ${isActive('builder.html')}" href="builder.html"><i class="fas fa-sliders me-1"></i>Konfigurator</a></li>
            <li class="nav-item">
              <button id="tools-toggle" class="nav-link ${isToolActive}" aria-haspopup="true" aria-expanded="false">
                <i class="fas fa-wrench me-1"></i>Tools
              </button>
              <ul id="tools-menu" class="nav-tools-menu" role="menu" aria-labelledby="tools-toggle">
                <li><a class="dropdown-item ${isActive('compare.html')}" href="compare.html"><i class="fas fa-code-compare me-2"></i>Vergleich</a></li>
                <li><a class="dropdown-item ${isActive('bottleneck.html')}" href="bottleneck.html"><i class="fas fa-gauge me-2"></i>Bottleneck</a></li>
                <li><a class="dropdown-item ${isActive('budget.html')}" href="budget.html"><i class="fas fa-wallet me-2"></i>Budget</a></li>
              </ul>
            </li>
            <li class="nav-item"><a class="nav-link ${isActive('knowledge.html')}" href="knowledge.html"><i class="fas fa-graduation-cap me-1"></i>Wissen</a></li>
            <li class="nav-item"><a class="nav-link ${isActive('faq.html')}" href="faq.html"><i class="fas fa-circle-question me-1"></i>FAQ</a></li>
            <li class="nav-item"><a class="nav-link ${isActive('news.html')}" href="news.html"><i class="fas fa-bolt me-1"></i>News</a></li>
            <li class="nav-item d-flex align-items-center ms-lg-2 mt-2 mt-lg-0">
              <button id="theme-toggle" class="toggle-btn" aria-label="Toggle Dark Mode">
                <div class="sun-rays"></div>
                <div class="main-circle"></div>
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </div>
  </header>
    `.trim();
}

function renderFooter() {
    return `
  <footer class="pt-5 pb-3">
    <div class="container">
      <div class="row">
        <div class="col-md-6 mb-4">
          <h5>Über das Projekt</h5>
          <p class="small mt-3">
            Ein moderner PC Konfigurator mit AI-Support. Erstellt als Schulprojekt an der HTL Leonding.
          </p>
          <p class="small mb-1">© 2026 David Leitner & Maximilian Baumgartner</p>
          <p class="small">
            <i class="fas fa-database me-1"></i> Enthält Informationen aus der <a href="https://github.com/buildcores/buildcores-open-db" target="_blank" class="text-decoration-underline">Buildcores Open Database</a>,
            <br>welche unter der <a href="https://opendatacommons.org/licenses/by/1-0/" target="_blank" class="text-decoration-underline">ODC Attribution License</a> bereitgestellt wird.
          </p>
        </div>
        <div class="col-md-6 mb-4 text-md-end">
          <h5>Links</h5>
          <ul class="list-unstyled small mt-3">
            <li class="mb-2">
              <a href="https://github.com/DavidLeitnerHTL/PC-Builder" target="_blank" class="text-decoration-none hover-white">
                <i class="fab fa-github me-1"></i> GitHub Repository
              </a>
            </li>
            <li class="mb-2">
              <a href="https://www.amazon.de" target="_blank" class="text-decoration-none hover-white">
                <i class="fab fa-amazon me-1"></i> Amazon Hardware
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom text-center">
        <small style="color: var(--text-secondary);">Designed with <span class="text-accent">●</span> precision</small>
      </div>
    </div>
    <div class="footer-spacer"></div>
  </footer>
    `.trim();
}

function setupToolsDropdown() {
    const toggle = document.getElementById('tools-toggle');
    const menu = document.getElementById('tools-menu');
    if (!toggle || !menu) return;

    // Teleport menu to <body> so it escapes the navbar's backdrop-filter
    // stacking context (which clips position:fixed/absolute children).
    document.body.appendChild(menu);

    function open() {
        const r = toggle.getBoundingClientRect();
        menu.style.top  = (r.bottom + 6) + 'px';
        menu.style.right = (window.innerWidth - r.right) + 'px';
        menu.classList.add('show');
        toggle.setAttribute('aria-expanded', 'true');
    }

    function close() {
        menu.classList.remove('show');
        toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.contains('show') ? close() : open();
    });

    // Close on outside click
    document.addEventListener('click', close);
    // Keep open when clicking inside the menu
    menu.addEventListener('click', (e) => e.stopPropagation());

    // Reposition on scroll/resize so it tracks the toggle button
    window.addEventListener('scroll', () => { if (menu.classList.contains('show')) open(); }, { passive: true });
    window.addEventListener('resize', () => { if (menu.classList.contains('show')) open(); }, { passive: true });
}

function initSiteLayout() {
    const headerPlaceholder = document.getElementById('site-header');
    if (headerPlaceholder) {
        headerPlaceholder.outerHTML = renderHeader();
    }

    const footerPlaceholder = document.getElementById('site-footer');
    if (footerPlaceholder) {
        footerPlaceholder.outerHTML = renderFooter();
    }

    setupToolsDropdown();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSiteLayout);
} else {
    initSiteLayout();
}
