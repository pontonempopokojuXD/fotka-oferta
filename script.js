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
