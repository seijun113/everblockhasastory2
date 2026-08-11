/* Every Block Has a Story — shared behavior
 *
 * Fully client-side prototype. Accounts, shirt-code verification, and
 * posted stories all live in this browser's localStorage — there is no
 * shared backend, so nothing here is visible to other visitors or devices.
 */

// ---------- Nav toggle + page setup ----------
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
  }
  markActiveNav();
  renderAllStoryGrids();
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

// ---------- Local storage helpers for posted stories + verified members ----------
function getPostedStories() {
  try { return JSON.parse(localStorage.getItem("ebs_posted_stories") || "[]"); }
  catch (e) { return []; }
}
function savePostedStories(list) {
  localStorage.setItem("ebs_posted_stories", JSON.stringify(list));
}
function getVerifiedAccounts() {
  try { return JSON.parse(localStorage.getItem("ebs_verified_accounts") || "[]"); }
  catch (e) { return []; }
}
function saveVerifiedAccounts(list) {
  localStorage.setItem("ebs_verified_accounts", JSON.stringify(list));
}
function makeId(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- API client (mock — everything lives in localStorage) ----------
const API = {
  async listStories() {
    return [...getPostedStories(), ...STORIES];
  },
  async getStory(id) {
    const all = [...getPostedStories(), ...STORIES];
    return all.find((s) => s.id === id) || null;
  },
  async createAccount(name, email) {
    return { id: makeId("acct"), name, email };
  },
  async getMembership(accountId) {
    const verified = getVerifiedAccounts();
    return verified.includes(accountId) ? { verified: true } : null;
  },
  async verifyMembership(accountId, code) {
    if (!code || code.trim().length < 4) {
      throw new Error("Enter the code from your shirt tag to continue.");
    }
    const verified = getVerifiedAccounts();
    if (!verified.includes(accountId)) {
      verified.push(accountId);
      saveVerifiedAccounts(verified);
    }
    return { verified: true };
  },
  async createStory(data) {
    const story = {
      id: makeId("s"),
      accountId: data.accountId,
      title: data.title,
      caption: data.caption,
      body: data.caption,
      location: data.location,
      country: data.country,
      author: data.author || "Anonymous",
      hue: Math.floor(Math.random() * 360),
      videoUrl: null,
    };
    const posted = getPostedStories();
    posted.unshift(story);
    savePostedStories(posted);
    return story;
  },
};

// ---------- Story card rendering ----------
function storyCardHTML(s) {
  const initials = (s.author || "?").split(" ").map((p) => p[0]).slice(0, 2).join("");
  return `
  <a class="story-card" href="story.html?id=${encodeURIComponent(s.id)}" data-country="${escapeAttr(s.country || "")}">
    <div class="story-media-fallback" style="background: linear-gradient(135deg, hsl(${s.hue || 30} 45% 22%), var(--ink-soft));"></div>
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

// ---------- Local "who am I" cache ----------
function getAccount() {
  try { return JSON.parse(localStorage.getItem("ebs_account") || "null"); }
  catch (e) { return null; }
}
function saveAccountCache(acct) { localStorage.setItem("ebs_account", JSON.stringify(acct)); }
function clearAccountCache() { localStorage.removeItem("ebs_account"); }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

// ---------- Account + purchase gate for Share Your Story ----------
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
  const unlockBtn = document.getElementById("unlock-btn");
  const codeInput = document.getElementById("order-code");
  if (!accountGate || !unlockGate || !form || !createAccountBtn || !unlockBtn) return;

  function showStep(step) {
    accountGate.style.display = step === "account" ? "block" : "none";
    unlockGate.style.display = step === "unlock" ? "block" : "none";
    form.style.display = step === "form" ? "block" : "none";
    const successPanel = document.getElementById("post-success");
    if (successPanel && step !== "form") successPanel.style.display = "none";
    if (banner) banner.style.display = step === "form" ? "flex" : "none";
  }

  async function renderFromState() {
    const account = getAccount();
    if (!account) { showStep("account"); return; }
    if (memberNameEl) memberNameEl.textContent = account.name;

    const membership = await API.getMembership(account.id);
    if (membership) {
      form.dataset.accountId = account.id;
      showStep("form");
    } else {
      showStep("unlock");
    }
  }

  createAccountBtn.addEventListener("click", async () => {
    const name = (acctNameInput.value || "").trim();
    const email = (acctEmailInput.value || "").trim();
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
    const originalLabel = createAccountBtn.textContent;
    createAccountBtn.disabled = true;
    createAccountBtn.textContent = "Creating…";
    try {
      const account = await API.createAccount(name, email);
      saveAccountCache(account);
      showToast(`Account created — welcome, ${account.name}!`);
      await renderFromState();
    } catch (err) {
      showToast(err.message || "Couldn't create account.");
    } finally {
      createAccountBtn.disabled = false;
      createAccountBtn.textContent = originalLabel;
    }
  });

  unlockBtn.addEventListener("click", async () => {
    const account = getAccount();
    if (!account) { showStep("account"); return; }
    const code = (codeInput.value || "").trim();
    if (code.length < 4) {
      showToast("Enter the code from your shirt tag to continue.");
      codeInput.focus();
      return;
    }
    const originalLabel = unlockBtn.textContent;
    unlockBtn.disabled = true;
    unlockBtn.textContent = "Verifying…";
    try {
      await API.verifyMembership(account.id, code);
      showToast("Shirt verified — tell your story below.");
      await renderFromState();
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      showToast(err.message || "Couldn't verify your code.");
    } finally {
      unlockBtn.disabled = false;
      unlockBtn.textContent = originalLabel;
    }
  });

  if (switchAccountLink) {
    switchAccountLink.addEventListener("click", (e) => {
      e.preventDefault();
      clearAccountCache();
      acctNameInput.value = "";
      acctEmailInput.value = "";
      codeInput.value = "";
      showStep("account");
      showToast("Signed out on this browser.");
    });
  }

  [acctNameInput, acctEmailInput].forEach((el) => {
    if (!el) return;
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); createAccountBtn.click(); } });
  });
  if (codeInput) {
    codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); unlockBtn.click(); } });
  }

  renderFromState();
}

// ---------- Share form ----------
async function countMyStories(accountId) {
  const stories = await API.listStories();
  return stories.filter((s) => s.accountId === accountId).length;
}

function initShareForm() {
  const form = document.getElementById("share-form");
  if (!form) return;
  const fileInput = document.getElementById("video-file");
  const dropzone = document.getElementById("dropzone");
  const preview = document.getElementById("video-preview");
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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const accountId = form.dataset.accountId;
    if (!accountId) {
      showToast("Please verify your shirt code before posting.");
      return;
    }

    const title = document.getElementById("story-title").value.trim();
    const caption = document.getElementById("story-caption").value.trim();
    const location = document.getElementById("story-location").value.trim();
    const country = document.getElementById("story-country").value.trim();
    const author = document.getElementById("story-author").value.trim() || "Anonymous";

    if (!title || !caption || !location) {
      showToast("Please fill in a title, location, and caption.");
      return;
    }

    const data = { accountId, title, caption, location, country, author };

    const originalLabel = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Posting…"; }

    try {
      await API.createStory(data);
      showToast("Your story is live!");

      const count = await countMyStories(accountId);
      if (postCountLine) {
        postCountLine.textContent = count === 1
          ? "That's your first story on the map."
          : `That's ${count} stories you've shared — keep going, there's no limit.`;
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
