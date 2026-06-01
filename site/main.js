/* ============================================================
   2peer site — runtime
   - pulls latest release (version + assets) from the GitHub API
   - detects OS, highlights the matching download card
   - graceful fallback when no release exists yet
   ============================================================ */
(() => {
  "use strict";

  const REPO = document.body.dataset.repo || "vercim/2peer";
  const FALLBACK_VERSION = document.body.dataset.fallbackVersion || "1.0.19";
  const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

  /* ---------- OS detection ------------------------------------ */
  const ua = navigator.userAgent;
  const platform = navigator.platform || "";
  const isMac = /Mac/i.test(platform) || /Mac OS X/i.test(ua);
  const isWin = /Win/i.test(platform) || /Windows/i.test(ua);
  const primaryOS = isWin ? "win" : isMac ? "mac" : null;

  /* ---------- hero CTA + detected card ------------------------ */
  const heroLabel = document.getElementById("hero-download-label");
  if (heroLabel) {
    heroLabel.textContent = isWin
      ? "Download for Windows"
      : isMac
        ? "Download for your Mac"
        : "Download";
  }
  if (primaryOS) {
    const card = document.getElementById(primaryOS === "win" ? "dl-win" : "dl-mac");
    if (card) card.classList.add("is-detected");
  }

  /* ---------- asset matching ---------------------------------- */
  const pickAsset = (assets, ...patterns) => {
    for (const re of patterns) {
      const hit = assets.find((a) => re.test(a.name));
      if (hit) return hit;
    }
    return null;
  };

  const setLink = (el, url, label) => {
    if (!el) return;
    el.href = url;
    if (label) {
      const span = el.querySelector(".btn__label");
      if (span) span.textContent = label;
    }
  };

  /* ---------- apply release data ------------------------------ */
  function applyRelease(rel) {
    const tag = (rel.tag_name || "").replace(/^v/i, "") || FALLBACK_VERSION;
    setVersion(tag);

    const assets = rel.assets || [];
    const dmg = pickAsset(assets, /\.dmg$/i);
    const macZip = pickAsset(assets, /mac.*\.zip$/i, /\.zip$/i);
    const exe = pickAsset(assets, /\.exe$/i, /setup.*\.exe$/i);

    const macBtn = document.querySelector('[data-os="mac"]');
    const macZipLink = document.querySelector('[data-os="mac-zip"]');
    const winBtn = document.querySelector('[data-os="win"]');

    if (dmg) setLink(macBtn, dmg.browser_download_url, `Download for macOS · v${tag}`);
    else markUnavailable("dl-mac");
    if (macZip) macZipLink && (macZipLink.href = macZip.browser_download_url);
    if (exe) setLink(winBtn, exe.browser_download_url, `Download for Windows · v${tag}`);
    else markUnavailable("dl-win");

    // hero button → detected platform's direct asset, else releases page
    const hero = document.getElementById("hero-download");
    if (hero) {
      if (primaryOS === "win" && exe) hero.href = exe.browser_download_url;
      else if (primaryOS === "mac" && dmg) hero.href = dmg.browser_download_url;
      else hero.href = "#download";
    }

    const status = document.getElementById("dl-status");
    if (status && (dmg || exe)) {
      status.innerHTML = `Released as <code>v${tag}</code> on GitHub. Prefer to choose manually? <a href="${RELEASES_PAGE}" target="_blank" rel="noopener" class="inline-link">Open the releases page →</a>`;
    }
  }

  function markUnavailable(cardId) {
    const card = document.getElementById(cardId);
    if (card) card.classList.add("is-unavailable");
  }

  function setVersion(v) {
    const label = document.getElementById("version-label");
    if (label) label.innerHTML = `version&nbsp;${v}`;
    const dlv = document.getElementById("download-version");
    if (dlv) dlv.textContent = `Version ${v}`;
  }

  /* ---------- fallback: no releases yet ----------------------- */
  function applyFallback() {
    setVersion(FALLBACK_VERSION);
    // links already point at RELEASES_PAGE in the markup; nothing to break.
    const status = document.getElementById("dl-status");
    if (status) {
      status.innerHTML = 'Builds are published on GitHub'
    }
  }

  /* ---------- fetch ------------------------------------------- */
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(applyRelease)
    .catch(() => applyFallback());

  /* ---------- reveal on scroll -------------------------------- */
  const revealTargets = document.querySelectorAll(
    ".section__head, .feature, .stat, .card, .dl-card, .wire"
  );
  revealTargets.forEach((el) => el.classList.add("reveal"));

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e, i) => {
          if (e.isIntersecting) {
            e.target.style.transitionDelay = `${(i % 4) * 60}ms`;
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
    );
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add("is-in"));
  }
})();
