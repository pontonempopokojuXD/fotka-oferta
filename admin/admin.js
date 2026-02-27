let supabaseClient = null;
let cmsConfig = null;

const refs = {
  loginBox: document.getElementById("loginBox"),
  cmsBox: document.getElementById("cmsBox"),
  status: document.getElementById("status"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  loginBtn: document.getElementById("loginBtn"),
  slug: document.getElementById("slug"),
  title: document.getElementById("title"),
  heroEyebrow: document.getElementById("heroEyebrow"),
  heroTitle: document.getElementById("heroTitle"),
  heroLead: document.getElementById("heroLead"),
  seoDescription: document.getElementById("seoDescription"),
  contentHtml: document.getElementById("contentHtml"),
  loadBtn: document.getElementById("loadBtn"),
  saveBtn: document.getElementById("saveBtn"),
  deleteBtn: document.getElementById("deleteBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  imageFile: document.getElementById("imageFile"),
  uploadBtn: document.getElementById("uploadBtn"),
  uploadResult: document.getElementById("uploadResult")
};

function setStatus(message, type = "ok") {
  refs.status.textContent = message;
  refs.status.className = `status ${type}`;
}

async function loadConfig() {
  const response = await fetch("../cms-config.json");
  cmsConfig = await response.json();
  if (!cmsConfig.enabled || !cmsConfig.supabaseUrl || !cmsConfig.supabaseAnonKey) {
    throw new Error("CMS nie jest skonfigurowany. Uzupełnij cms-config.json.");
  }
  supabaseClient = window.supabase.createClient(cmsConfig.supabaseUrl, cmsConfig.supabaseAnonKey);
}

function getFormData() {
  return {
    slug: refs.slug.value.trim(),
    title: refs.title.value.trim(),
    hero_eyebrow: refs.heroEyebrow.value.trim(),
    hero_title: refs.heroTitle.value.trim(),
    hero_lead: refs.heroLead.value.trim(),
    seo_description: refs.seoDescription.value.trim(),
    content_html: refs.contentHtml.value.trim(),
    published: true
  };
}

function fillForm(row) {
  refs.title.value = row?.title || "";
  refs.heroEyebrow.value = row?.hero_eyebrow || "";
  refs.heroTitle.value = row?.hero_title || "";
  refs.heroLead.value = row?.hero_lead || "";
  refs.seoDescription.value = row?.seo_description || "";
  refs.contentHtml.value = row?.content_html || "";
}

async function login() {
  const email = refs.email.value.trim();
  const password = refs.password.value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function ensureSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  const hasSession = !!data?.session;
  refs.loginBox.classList.toggle("hidden", hasSession);
  refs.cmsBox.classList.toggle("hidden", !hasSession);
  return hasSession;
}

async function loadPage() {
  const slug = refs.slug.value.trim();
  if (!slug) {
    setStatus("Podaj slug strony.", "err");
    return;
  }
  const { data, error } = await supabaseClient.from("cms_pages").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  fillForm(data || {});
  setStatus(data ? `Wczytano: ${slug}` : `Brak wpisu dla ${slug}. Możesz utworzyć nowy.`);
}

async function savePage() {
  const payload = getFormData();
  if (!payload.slug) {
    setStatus("Slug jest wymagany.", "err");
    return;
  }
  const { error } = await supabaseClient.from("cms_pages").upsert(payload, { onConflict: "slug" });
  if (error) throw error;
  setStatus(`Zapisano stronę: ${payload.slug}`);
}

async function deletePage() {
  const slug = refs.slug.value.trim();
  if (!slug) {
    setStatus("Podaj slug strony do usunięcia.", "err");
    return;
  }
  if (!confirm(`Usunąć wpis CMS dla slug: ${slug}?`)) return;
  const { error } = await supabaseClient.from("cms_pages").delete().eq("slug", slug);
  if (error) throw error;
  fillForm({});
  setStatus(`Usunięto wpis: ${slug}`);
}

async function uploadImage() {
  const file = refs.imageFile.files?.[0];
  if (!file) {
    setStatus("Wybierz plik do uploadu.", "err");
    return;
  }
  const fileName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
  const path = `uploads/${fileName}`;
  const { error } = await supabaseClient.storage.from(cmsConfig.storageBucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });
  if (error) throw error;
  const { data } = supabaseClient.storage.from(cmsConfig.storageBucket).getPublicUrl(path);
  refs.uploadResult.textContent = data.publicUrl;
  setStatus("Zdjęcie zostało przesłane.");
}

async function logout() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
  refs.loginBox.classList.remove("hidden");
  refs.cmsBox.classList.add("hidden");
  setStatus("Wylogowano.");
}

async function init() {
  try {
    await loadConfig();
    await ensureSession();

    refs.loginBtn.addEventListener("click", async () => {
      try {
        await login();
        await ensureSession();
        setStatus("Zalogowano.");
      } catch (err) {
        setStatus(err.message || "Błąd logowania.", "err");
      }
    });

    refs.loadBtn.addEventListener("click", async () => {
      try {
        await loadPage();
      } catch (err) {
        setStatus(err.message || "Błąd wczytywania.", "err");
      }
    });

    refs.saveBtn.addEventListener("click", async () => {
      try {
        await savePage();
      } catch (err) {
        setStatus(err.message || "Błąd zapisu.", "err");
      }
    });

    refs.deleteBtn.addEventListener("click", async () => {
      try {
        await deletePage();
      } catch (err) {
        setStatus(err.message || "Błąd usuwania.", "err");
      }
    });

    refs.uploadBtn.addEventListener("click", async () => {
      try {
        await uploadImage();
      } catch (err) {
        setStatus(err.message || "Błąd uploadu.", "err");
      }
    });

    refs.logoutBtn.addEventListener("click", async () => {
      try {
        await logout();
      } catch (err) {
        setStatus(err.message || "Błąd wylogowania.", "err");
      }
    });
  } catch (err) {
    setStatus(err.message || "Błąd inicjalizacji CMS.", "err");
  }
}

init();
