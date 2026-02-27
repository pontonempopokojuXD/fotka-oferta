const menuButton = document.querySelector(".menu-toggle");
const mainNav = document.querySelector(".main-nav");
const yearNode = document.querySelector("#year");

if (menuButton && mainNav) {
  menuButton.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mainNav.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
    });
  });
}

if (yearNode) {
  yearNode.textContent = String(new Date().getFullYear());
}

function detectSlugFromPath() {
  const clean = window.location.pathname.replace(/\/+$/, "");
  if (clean.endsWith("/index.html") || clean === "" || clean === "/") return "home";
  const parts = clean.split("/").filter(Boolean);
  const pageIdx = parts.indexOf("pages");
  if (pageIdx >= 0) {
    return parts.slice(pageIdx + 1).join("/").replace(/\/index\.html$/, "");
  }
  const maybeHtml = parts[parts.length - 1];
  if (maybeHtml.endsWith(".html")) return maybeHtml.replace(".html", "");
  return "home";
}

function getScriptBasePath() {
  const script = document.querySelector("script[src$='script.js']");
  if (!script) return ".";
  const src = script.getAttribute("src") || "script.js";
  const base = src.replace(/\/?script\.js(?:\?.*)?$/, "");
  return base || ".";
}

function initCarousel() {
  const carousel = document.querySelector("[data-carousel]");
  if (!carousel) return;

  const track = carousel.querySelector("[data-carousel-track]");
  const slides = Array.from(carousel.querySelectorAll(".carousel-slide"));
  const prevButton = carousel.querySelector("[data-carousel-prev]");
  const nextButton = carousel.querySelector("[data-carousel-next]");
  const dotsContainer = carousel.querySelector("[data-carousel-dots]");
  if (!track || slides.length === 0 || !prevButton || !nextButton || !dotsContainer) return;

  let currentIndex = 0;
  let autoplayTimer = null;
  let startX = 0;
  let endX = 0;

  slides.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "carousel-dot";
    dot.setAttribute("aria-label", `Przejdz do slajdu ${index + 1}`);
    dot.addEventListener("click", () => {
      goTo(index);
      restartAutoplay();
    });
    dotsContainer.appendChild(dot);
  });

  const dots = Array.from(dotsContainer.querySelectorAll(".carousel-dot"));

  function render() {
    track.style.transform = `translateX(-${currentIndex * 100}%)`;
    slides.forEach((slide, idx) => {
      slide.classList.toggle("is-active", idx === currentIndex);
    });
    dots.forEach((dot, idx) => {
      dot.classList.toggle("active", idx === currentIndex);
    });
  }

  function goTo(index) {
    currentIndex = (index + slides.length) % slides.length;
    render();
  }

  function next() {
    goTo(currentIndex + 1);
  }

  function prev() {
    goTo(currentIndex - 1);
  }

  function stopAutoplay() {
    if (autoplayTimer) {
      window.clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  }

  function startAutoplay() {
    stopAutoplay();
    autoplayTimer = window.setInterval(next, 5000);
  }

  function restartAutoplay() {
    startAutoplay();
  }

  prevButton.addEventListener("click", () => {
    prev();
    restartAutoplay();
  });
  nextButton.addEventListener("click", () => {
    next();
    restartAutoplay();
  });

  carousel.addEventListener("mouseenter", stopAutoplay);
  carousel.addEventListener("mouseleave", startAutoplay);

  carousel.addEventListener("touchstart", (event) => {
    startX = event.changedTouches[0].clientX;
  });
  carousel.addEventListener("touchend", (event) => {
    endX = event.changedTouches[0].clientX;
    const delta = endX - startX;
    if (Math.abs(delta) > 45) {
      if (delta < 0) next();
      else prev();
      restartAutoplay();
    }
  });

  render();
  startAutoplay();
}

initCarousel();

function initScrollReveal() {
  const revealTargets = document.querySelectorAll(
    ".hero-grid > div, .hours-card, .section, .card, .price-item, .upload-form, .contact-cta, blockquote"
  );
  if (!revealTargets.length) return;

  document.body.classList.add("reveal-ready");
  revealTargets.forEach((node) => node.classList.add("reveal-item"));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  revealTargets.forEach((node) => observer.observe(node));
}

initScrollReveal();

async function initContentCms() {
  const targets = document.querySelectorAll("[data-content-key]");
  let localData = {};
  const basePath = getScriptBasePath();

  try {
    const response = await fetch(`${basePath}/content.json`);
    if (response.ok) localData = await response.json();
  } catch (_) {
    // keep defaults from HTML
  }

  try {
    const overrideRaw = localStorage.getItem("fotkaContentOverride");
    if (overrideRaw) {
      const override = JSON.parse(overrideRaw);
      localData = { ...localData, ...override };
    }
  } catch (_) {
    // ignore malformed local override
  }

  function applyKeyData(data) {
    if (!targets.length) return;
    targets.forEach((node) => {
      const key = node.getAttribute("data-content-key");
      if (!key || !(key in data)) return;
      const value = String(data[key] ?? "");
      const attr = node.getAttribute("data-content-attr");
      if (attr) node.setAttribute(attr, value);
      else node.textContent = value;
    });

    const phone = data.contactPhone;
    if (phone) {
      const href = "tel:" + phone.replace(/\s+/g, "");
      document.querySelectorAll("[data-content-key='contactPhone']").forEach((el) => el.setAttribute("href", href));
    }
    const email = data.contactEmail;
    if (email) {
      const href = "mailto:" + email;
      document.querySelectorAll("[data-content-key='contactEmail']").forEach((el) => el.setAttribute("href", href));
    }
  }

  applyKeyData(localData);

  // Headless CMS override (Supabase)
  try {
    const configResp = await fetch(`${basePath}/cms-config.json`);
    if (!configResp.ok) return;
    const config = await configResp.json();
    if (!config.enabled || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) return;
    const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const slug = detectSlugFromPath();
    const { data, error } = await client
      .from("cms_pages")
      .select("slug,title,hero_eyebrow,hero_title,hero_lead,seo_description,content_html,published")
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();

    if (error || !data) return;

    // Apply generic page content
    const heroEyebrow = document.querySelector(".hero .eyebrow");
    const heroTitle = document.querySelector(".hero h1");
    const heroLead = document.querySelector(".hero .lead");
    const content = document.querySelector(".page-content");

    if (heroEyebrow && data.hero_eyebrow) heroEyebrow.textContent = data.hero_eyebrow;
    if (heroTitle && data.hero_title) heroTitle.textContent = data.hero_title;
    if (heroLead && data.hero_lead) heroLead.textContent = data.hero_lead;
    if (content && data.content_html) content.innerHTML = data.content_html;
    if (data.seo_description) {
      const desc = document.querySelector("meta[name='description']");
      if (desc) desc.setAttribute("content", data.seo_description);
    }
    if (data.title) document.title = `${data.title} | FOT-KA Warszawa`;
  } catch (_) {
    // silent fallback
  }
}

initContentCms();
