/* Every Block Has a Story — shared behavior
 *
 * Talks to the real backend (see the separate backend-api project) for
 * accounts, Shopify order verification, and video posting. Only the
 * account's own "who am I" pointer and session tokens are cached in
 * localStorage — everyone's actual account data, verified-purchase status,
 * and posted videos live server-side and are visible to every visitor.
 */

// EDIT THIS: your backend's real Vercel address, e.g. "https://every-block-backend.vercel.app"
const API_BASE = "https://every-block-backend.vercel.app";

// ---------- Nav toggle + page setup ----------
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
  }
  markActiveNav();
  renderAllStoryGrids();
  renderMapPins();
  wireCarousel();
  initShareGate();
  initShareForm();
  initShop();
  document.querySelectorAll(".chip[data-filter]").forEach((chip) => {
    chip.addEventListener("click", () => filterStories(chip.getAttribute("data-filter")));
  });
});

function markActiveNav() {
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".main-nav a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === path || (path === "" && href === "index.html")) {
      a.classList.add("active");
    }
  });
}

// ---------- Seed story content ----------
const STORIES = [
  { id: "s1", title: "The Corner That Raised Me", caption: "The bodega on 8th where every kid on the block learned to count change.", location: "New York, USA", country: "USA", author: "Jamal R.", hue: 18, videoUrl: null,
    body: "The bodega on 8th Street has been there longer than I have. Mr. Ortiz knew every kid on the block by name, and knew exactly how much credit to extend until Friday." },
  { id: "s2", title: "Market Days, Dreaming Bigger", caption: "Saturdays at the market taught me more about business than school ever did.", location: "Lagos, Nigeria", country: "Nigeria", author: "Aisha T.", hue: 150, videoUrl: null,
    body: "Every Saturday my mother took me to Balogun Market before sunrise to help set up her fabric stall. I learned to negotiate before I learned long division." },
  { id: "s3", title: "Roots, Rituals, Remembered", caption: "Every autumn the whole street walks to the shrine together.", location: "Kyoto, Japan", country: "Japan", author: "Hiroshi K.", hue: 260, videoUrl: null,
    body: "Every autumn, when the maple leaves turn, our whole street walks together to the small shrine at the end of the lane." },
  { id: "s4", title: "Colors of Resilience", caption: "We painted every wall on the hillside so the world could see us.", location: "Medellín, Colombia", country: "Colombia", author: "María G.", hue: 30, videoUrl: null,
    body: "Comuna 13 used to be known for one thing, and it wasn't good. So the artists in our neighborhood picked up brushes instead of anything else." },
  { id: "s5", title: "Where the Trains Slow Down", caption: "My grandmother still waves at every train that passes our house.", location: "Mumbai, India", country: "India", author: "Priya N.", hue: 340, videoUrl: null,
    body: "Our house sits right where the local trains slow down before the station, and my grandmother has waved at every single one for forty years." },
  { id: "s6", title: "Sunset Over the Souk", caption: "The smell of cumin and mint tea means I'm almost home.", location: "Marrakech, Morocco", country: "Morocco", author: "Youssef B.", hue: 200, videoUrl: null,
    body: "The souk near our house comes alive right as the sun starts to drop — the smell of cumin, grilled meat, and mint tea rolling through the alleys." },
  { id: "s7", title: "Concrete and Community", caption: "Basketball hoops turned strangers into family, one game at a time.", location: "Chicago, USA", country: "USA", author: "DeShawn L.", hue: 210, videoUrl: null,
    body: "The court on our block doesn't have a net, and one rim is bent from a kid climbing it on a dare in 2009. Doesn't matter." },
  { id: "s8", title: "The Alley of Lanterns", caption: "Every Lunar New Year the alley glows red for a week straight.", location: "Taipei, Taiwan", country: "Taiwan", author: "Wen C.", hue: 5, videoUrl: null,
    body: "Every Lunar New Year, our alley strings up red lanterns from every balcony until the whole street glows for a week straight." },
];

// ---------- Session tokens (the account itself lives server-side; only
// these short-lived tokens are cached locally, same as any normal login) ----------
function getTokens() {
  try {
    return {
      access: localStorage.getItem("ebs_access_token"),
      refresh: localStorage.getItem("ebs_refresh_token"),
    };
  } catch (e) { return { access: null, refresh: null }; }
}
function saveTokens(session) {
  localStorage.setItem("ebs_access_token", session.access_token);
  localStorage.setItem("ebs_refresh_token", session.refresh_token);
}
function clearTokens() {
  localStorage.removeItem("ebs_access_token");
  localStorage.removeItem("ebs_refresh_token");
}

async function tryRefreshToken() {
  const { refresh } = getTokens();
  if (!refresh) return false;
  try {
    const res = await fetch(API_BASE + "/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    saveTokens(data.session);
    return true;
  } catch (e) {
    return false;
  }
}

// Fetch wrapper that attaches the access token and retries once with a
// refreshed token if the first attempt comes back unauthorized.
async function apiFetch(path, options = {}) {
  const { access } = getTokens();
  const headers = Object.assign({}, options.headers, access ? { Authorization: "Bearer " + access } : {});
  let res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
  if (res.status === 401 && access) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const { access: newAccess } = getTokens();
      const headers2 = Object.assign({}, options.headers, { Authorization: "Bearer " + newAccess });
      res = await fetch(API_BASE + path, Object.assign({}, options, { headers: headers2 }));
    }
  }
  return res;
}

// Turns a video record from the backend into the same shape storyCardHTML
// and story.html already expect, so real posts render exactly like the
// seed demo stories.
function videoToStoryShape(v) {
  return {
    id: "v_" + v.id,
    title: v.title,
    caption: v.caption,
    body: v.caption,
    location: v.location,
    country: v.country,
    author: v.author,
    hue: Math.floor(Math.random() * 360),
    videoUrl: v.iframeUrl || null,
    thumbnailUrl: v.thumbnailUrl || null,
    lat: typeof v.lat === "number" ? v.lat : null,
    lng: typeof v.lng === "number" ? v.lng : null,
  };
}

// ---------- Map pin placement ----------
// Converts real-world lat/lng into a left%/top% position on the site's
// stylized worldmap-base image. This is a plain equirectangular projection
// (left = longitude, top = latitude) with a small scale + margin correction
// fitted to match the 8 hand-placed seed pins already in map.html, so
// auto-placed pins line up visually with the existing ones.
function latLngToMapPercent(lat, lng) {
  const rawLeft = ((lng + 180) / 360) * 100;
  const rawTop = ((90 - lat) / 180) * 100;
  const left = 0.88 * rawLeft + 6;
  const top = 0.88 * rawTop + 6;
  return { left, top };
}

// Adds a pin to the map for every real posted story that has coordinates.
// Seed demo stories already have their own hand-placed pins directly in
// map.html, so only real (v_...) stories are added here to avoid duplicates.
async function renderMapPins() {
  const mapEl = document.querySelector(".hero-map");
  if (!mapEl) return;
  const stories = await API.listStories();
  const withCoords = stories.filter(
    (s) => String(s.id).startsWith("v_") && typeof s.lat === "number" && typeof s.lng === "number"
  );
  const pinsHTML = withCoords
    .map((s) => {
      const { left, top } = latLngToMapPercent(s.lat, s.lng);
      const hue = s.hue || 30;
      const color = `hsl(${hue} 40% 45%)`;
      const title = `${s.location || ""} — ${s.title || "Untitled Story"}`;
      return `<a class="map-pin" href="story.html?id=${encodeURIComponent(s.id)}" style="--pc:${color}; left:${left.toFixed(1)}%; top:${top.toFixed(1)}%;" title="${escapeAttr(title)}"></a>`;
    })
    .join("");
  if (pinsHTML) {
    mapEl.insertAdjacentHTML("beforeend", pinsHTML);
  }
}

let API_OFFLINE_WARNED = false;
function warnOffline() {
  if (API_OFFLINE_WARNED) return;
  API_OFFLINE_WARNED = true;
  console.warn("Every Block Has a Story: couldn't reach the backend at " + API_BASE + ". Showing local demo stories only.");
}

// ---------- API client (real backend, with graceful offline fallback) ----------
const API = {
  async listStories() {
    try {
      const res = await fetch(API_BASE + "/api/videos");
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      const realVideos = (data.videos || []).map(videoToStoryShape);
      return [...realVideos, ...STORIES];
    } catch (e) {
      warnOffline();
      return STORIES;
    }
  },
  async getStory(id) {
    if (String(id).startsWith("v_")) {
      const realId = String(id).slice(2);
      try {
        const res = await fetch(API_BASE + "/api/videos");
        if (!res.ok) throw new Error("bad status");
        const data = await res.json();
        const v = (data.videos || []).find((x) => x.id === realId);
        return v ? videoToStoryShape(v) : null;
      } catch (e) {
        warnOffline();
        return null;
      }
    }
    return STORIES.find((s) => s.id === id) || null;
  },
};

// ---------- Story card rendering ----------
function storyCardHTML(s) {
  const initials = (s.author || "?").split(" ").map((p) => p[0]).slice(0, 2).join("");
  const media = s.thumbnailUrl
    ? `<div class="story-media-fallback" style="background-image:url('${escapeAttr(s.thumbnailUrl)}'); background-size:cover; background-position:center;"></div>`
    : `<div class="story-media-fallback" style="background: linear-gradient(135deg, hsl(${s.hue || 30} 45% 22%), var(--ink-soft));"></div>`;
  return `
  <a class="story-card" href="story.html?id=${encodeURIComponent(s.id)}" data-country="${escapeAttr(s.country || "")}">
    ${media}
    <span class="story-loc">${pinIcon()} ${escapeHtml(s.location || "")}</span>
    <span class="play-badge">${playIcon()}</span>
    <div class="story-body">
      <h3>${escapeHtml(s.title || "Untitled Story")}</h3>
      <div class="story-user">
        <span class="avatar">${escapeHtml(initials)}</span>
        <span>${escapeHtml(s.author || "Anonymous")}</span>
      </div>
    </div>
  </a>`;
}

async function renderAllStoryGrids() {
  const grids = document.querySelectorAll("[data-story-grid]");
  if (!grids.length) return;
  const stories = await API.listStories();
  grids.forEach((grid) => {
    const limit = parseInt(grid.getAttribute("data-limit") || "0", 10);
    let list = stories;
    if (limit) list = list.slice(0, limit);
    grid.innerHTML = list.map(storyCardHTML).join("");
  });
}

function filterStories(country) {
  document.querySelectorAll(".story-card").forEach((card) => {
    const show = country === "all" || card.getAttribute("data-country") === country;
    card.style.display = show ? "" : "none";
  });
  document.querySelectorAll(".chip[data-filter]").forEach((chip) => {
    chip.classList.toggle("active", chip.getAttribute("data-filter") === country);
  });
}

function wireCarousel() {
  const grid = document.querySelector("[data-story-grid][data-scrollable]");
  const next = document.querySelector("[data-carousel-next]");
  if (grid && next) {
    next.addEventListener("click", () => {
      grid.scrollBy({ left: 300, behavior: "smooth" });
    });
  }
}

// ---------- Small icon helpers (inline SVG) ----------
function pinIcon() {
  return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-7.4 8-13a8 8 0 1 0-16 0c0 5.6 8 13 8 13z"/><circle cx="12" cy="9" r="2.5"/></svg>`;
}
function playIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function escapeAttr(str) { return escapeHtml(str); }

// ---------- Toast ----------
function showToast(msg) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

// ---------- Local "who am I" cache (display only — the real account lives
// server-side; this just remembers a name/email to show in the banner) ----------
function getAccount() {
  try { return JSON.parse(localStorage.getItem("ebs_account") || "null"); }
  catch (e) { return null; }
}
function saveAccountCache(acct) { localStorage.setItem("ebs_account", JSON.stringify(acct)); }
function clearAccountCache() { localStorage.removeItem("ebs_account"); }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

// ---------- Account + Shopify purchase gate for Share Your Story ----------
function initShareGate() {
  const banner = document.getElementById("member-banner");
  const memberNameEl = document.getElementById("member-name");
  const switchAccountLink = document.getElementById("switch-account");
  const accountGate = document.getElementById("account-gate");
  const unlockGate = document.getElementById("unlock-gate");
  const form = document.getElementById("share-form");
  const createAccountBtn = document.getElementById("create-account-btn");
  const acctNameInput = document.getElementById("acct-name");
  const acctEmailInput = document.getElementById("acct-email");
  const acctPasswordInput = document.getElementById("acct-password");
  const unlockBtn = document.getElementById("unlock-btn");
  const codeInput = document.getElementById("order-code"); // now holds a Shopify order number
  if (!accountGate || !unlockGate || !form || !createAccountBtn || !unlockBtn) return;

  function showStep(step) {
    accountGate.style.display = step === "account" ? "block" : "none";
    unlockGate.style.display = step === "unlock" ? "block" : "none";
    form.style.display = step === "form" ? "block" : "none";
    const successPanel = document.getElementById("post-success");
    if (successPanel && step !== "form") successPanel.style.display = "none";
    if (banner) banner.style.display = step === "form" ? "flex" : "none";
  }

  // Checks the real backend: are we logged in, and is this account
  // Shopify-verified? Both facts live server-side, not in localStorage.
  async function renderFromState() {
    const { access } = getTokens();
    if (!access) { showStep("account"); return; }

    try {
      const res = await apiFetch("/api/auth/session");
      if (!res.ok) {
        clearTokens();
        showStep("account");
        return;
      }
      const data = await res.json();
      if (memberNameEl) memberNameEl.textContent = data.profile.name || data.user.email;
      saveAccountCache({ name: data.profile.name, email: data.user.email });

      if (data.profile.shopify_verified) {
        form.dataset.verified = "true";
        showStep("form");
      } else {
        showStep("unlock");
      }
    } catch (err) {
      showToast("Couldn't reach the server — check your connection and try again.");
      showStep("account");
    }
  }

  createAccountBtn.addEventListener("click", async () => {
    const name = (acctNameInput.value || "").trim();
    const email = (acctEmailInput.value || "").trim();
    const password = (acctPasswordInput ? acctPasswordInput.value : "").trim();
    if (!name) {
      showToast("Enter your name to create an account.");
      acctNameInput.focus();
      return;
    }
    if (!isValidEmail(email)) {
      showToast("Enter a valid email to create an account.");
      acctEmailInput.focus();
      return;
    }
    if (password.length < 8) {
      showToast("Password must be at least 8 characters.");
      if (acctPasswordInput) acctPasswordInput.focus();
      return;
    }

    const originalLabel = createAccountBtn.textContent;
    createAccountBtn.disabled = true;
    createAccountBtn.textContent = "Creating…";
    try {
      // Try creating a new account first; if one already exists for this
      // email, fall back to logging in with the same email/password.
      let res = await fetch(API_BASE + "/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      let data = await res.json();

      if (!res.ok) {
        res = await fetch(API_BASE + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't create or sign into that account.");
      }

      if (!data.session) {
        throw new Error("Check your email to confirm your account, then enter your password again to sign in.");
      }

      saveTokens(data.session);
      saveAccountCache({ name, email });
      showToast("Signed in — welcome, " + name + "!");
      await renderFromState();
    } catch (err) {
      showToast(err.message || "Couldn't create account.");
    } finally {
      createAccountBtn.disabled = false;
      createAccountBtn.textContent = originalLabel;
    }
  });

  unlockBtn.addEventListener("click", async () => {
    const orderNumber = (codeInput.value || "").trim();
    if (!orderNumber) {
      showToast("Enter your Shopify order number to continue.");
      codeInput.focus();
      return;
    }
    const originalLabel = unlockBtn.textContent;
    unlockBtn.disabled = true;
    unlockBtn.textContent = "Verifying…";
    try {
      const res = await apiFetch("/api/shopify/verify-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't verify your order.");
      if (!data.verified) throw new Error(data.reason || "That order couldn't be verified.");

      showToast("Order verified — tell your story below.");
      await renderFromState();
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      showToast(err.message || "Couldn't verify your order.");
    } finally {
      unlockBtn.disabled = false;
      unlockBtn.textContent = originalLabel;
    }
  });

  if (switchAccountLink) {
    switchAccountLink.addEventListener("click", (e) => {
      e.preventDefault();
      clearTokens();
      clearAccountCache();
      acctNameInput.value = "";
      acctEmailInput.value = "";
      if (acctPasswordInput) acctPasswordInput.value = "";
      codeInput.value = "";
      showStep("account");
      showToast("Signed out on this browser.");
    });
  }

  [acctNameInput, acctEmailInput, acctPasswordInput].forEach((el) => {
    if (!el) return;
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); createAccountBtn.click(); } });
  });
  if (codeInput) {
    codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); unlockBtn.click(); } });
  }

  renderFromState();
}

// ---------- Share form (real Cloudflare Stream upload) ----------
function initShareForm() {
  const form = document.getElementById("share-form");
  if (!form) return;
  const fileInput = document.getElementById("video-file");
  const dropzone = document.getElementById("dropzone");
  const preview = document.getElementById("video-preview");
  const thumbInput = document.getElementById("thumbnail-file");
  const thumbDropzone = document.getElementById("thumb-dropzone");
  const thumbPreview = document.getElementById("thumbnail-preview");
  const successPanel = document.getElementById("post-success");
  const postCountLine = document.getElementById("post-count-line");
  const postAnotherBtn = document.getElementById("post-another-btn");
  const submitBtn = form.querySelector('button[type="submit"]');

  function resetForm() {
    form.reset();
    dropzone.classList.remove("has-file");
    dropzone.querySelector(".dz-text").textContent = "Drag & drop a video, or click to browse";
    preview.style.display = "none";
    preview.removeAttribute("src");
    if (thumbDropzone) {
      thumbDropzone.classList.remove("has-file");
      thumbDropzone.querySelector(".dz-text").textContent = "Drag & drop an image, or click to browse";
    }
    if (thumbPreview) {
      thumbPreview.style.display = "none";
      thumbPreview.removeAttribute("src");
    }
  }

  if (postAnotherBtn) {
    postAnotherBtn.addEventListener("click", () => {
      resetForm();
      if (successPanel) successPanel.style.display = "none";
      form.style.display = "block";
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("has-file"); });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleFile(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  function handleFile(file) {
    dropzone.classList.add("has-file");
    dropzone.querySelector(".dz-text").textContent = `Selected: ${file.name}`;
    if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      preview.src = url;
      preview.style.display = "block";
    }
  }

  if (thumbDropzone && thumbInput) {
    thumbDropzone.addEventListener("click", () => thumbInput.click());
    thumbDropzone.addEventListener("dragover", (e) => { e.preventDefault(); thumbDropzone.classList.add("has-file"); });
    thumbDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) {
        thumbInput.files = e.dataTransfer.files;
        handleThumbFile(e.dataTransfer.files[0]);
      }
    });
    thumbInput.addEventListener("change", () => {
      if (thumbInput.files.length) handleThumbFile(thumbInput.files[0]);
    });
  }

  function handleThumbFile(file) {
    thumbDropzone.classList.add("has-file");
    thumbDropzone.querySelector(".dz-text").textContent = `Selected: ${file.name}`;
    if (file.type.startsWith("image/") && thumbPreview) {
      thumbPreview.src = URL.createObjectURL(file);
      thumbPreview.style.display = "block";
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!form.dataset.verified) {
      showToast("Please verify your Shopify order before posting.");
      return;
    }

    const title = document.getElementById("story-title").value.trim();
    const caption = document.getElementById("story-caption").value.trim();
    const location = document.getElementById("story-location").value.trim();
    const country = document.getElementById("story-country").value.trim();
    const author = document.getElementById("story-author").value.trim() || "Anonymous";
    const file = fileInput.files[0];

    if (!title || !caption || !location) {
      showToast("Please fill in a title, location, and caption.");
      return;
    }
    if (!file) {
      showToast("A video is required to post — attach one above.");
      return;
    }

    const originalLabel = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Getting upload link…"; }

    try {
      // 1. Ask our backend for a one-time Cloudflare Stream upload URL.
      const urlRes = await apiFetch("/api/videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error || "Couldn't start the upload.");

      // 2. Upload the video file straight to Cloudflare — never through our own server.
      if (submitBtn) submitBtn.textContent = "Uploading video…";
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      const uploadRes = await fetch(urlData.uploadURL, { method: "POST", body: uploadForm });
      if (!uploadRes.ok) throw new Error("Video upload failed — try a smaller file or a different format.");

      // 2b. If a custom thumbnail was chosen, upload it too. If not, we
      // simply don't send a thumbnailUrl — the backend defaults to a frame
      // from 2 seconds into the video automatically.
      let thumbnailUrl = null;
      const thumbFile = thumbInput && thumbInput.files[0];
      if (thumbFile) {
        if (submitBtn) submitBtn.textContent = "Uploading thumbnail…";
        const thumbForm = new FormData();
        thumbForm.append("thumbnail", thumbFile);
        const thumbRes = await apiFetch("/api/videos/thumbnail-upload", { method: "POST", body: thumbForm });
        const thumbData = await thumbRes.json();
        if (!thumbRes.ok) throw new Error(thumbData.error || "Couldn't upload thumbnail.");
        thumbnailUrl = thumbData.thumbnailUrl;
      }

      // 3. Save the story's details, linked to that uploaded video.
      if (submitBtn) submitBtn.textContent = "Posting…";
      const saveRes = await apiFetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloudflareUid: urlData.uid, title, caption, location, country, author, thumbnailUrl }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || "Couldn't save your story.");

      showToast("Your story is submitted!");
      if (postCountLine) {
        postCountLine.textContent = "Thanks for sharing — new videos are reviewed before they appear publicly, so it may take a little while to show up.";
      }

      resetForm();
      form.style.display = "none";
      if (successPanel) {
        successPanel.style.display = "block";
        successPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      renderAllStoryGrids();
    } catch (err) {
      showToast(err.message || "Couldn't post your story.");
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
    }
  });
}

// ---------- Shop / real Shopify checkout ----------
// Every Block Tee — live product on the connected Shopify store.
// Cart permalinks (https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks)
// send the buyer straight to a real Shopify checkout for the chosen variant —
// no app or backend required on this site's end.
const SHOPIFY_STORE_DOMAIN = "everybodyhasastory.myshopify.com";
const SHOPIFY_VARIANTS = {
  "S": "55093238268223",
  "M": "55093238300991",
  "L": "55093238333759",
  "XL": "55093238366527",
  "2XL": "55093238399295",
};

function initShop() {
  const swatches = document.querySelectorAll(".size-swatch");
  let selectedSize = "M";
  swatches.forEach((sw) => {
    sw.addEventListener("click", () => {
      swatches.forEach((s) => s.classList.remove("selected"));
      sw.classList.add("selected");
      selectedSize = sw.textContent.trim();
    });
  });

  const buyBtn = document.getElementById("buy-btn");
  if (buyBtn) {
    buyBtn.addEventListener("click", () => {
      const variantId = SHOPIFY_VARIANTS[selectedSize];
      if (!variantId) {
        showToast("That size isn't available right now.");
        return;
      }
      window.location.href = `https://${SHOPIFY_STORE_DOMAIN}/cart/${variantId}:1`;
    });
  }
}
