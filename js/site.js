// site.js - Shared behaviour for the marketing pages (landing, about)
(() => {
    // Piece glyphs: <span class="piece" data-shape="0100 1110"> becomes a
    // 4x2 grid of cells, filled where the shape has a 1. Decorative only.
    document.querySelectorAll(".piece[data-shape]").forEach((el) => {
        el.setAttribute("aria-hidden", "true");
        for (const ch of el.dataset.shape.replace(/\s/g, "")) {
            const i = document.createElement("i");
            if (ch !== "1") i.style.background = "transparent";
            el.appendChild(i);
        }
    });

    // Reveal on scroll. Anything already on screen is revealed at once, and
    // every element is unhidden if IntersectionObserver is missing.
    const reveals = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
        reveals.forEach((el) => el.classList.add("visible"));
        return;
    }
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("visible");
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );
    reveals.forEach((el) => observer.observe(el));
})();
