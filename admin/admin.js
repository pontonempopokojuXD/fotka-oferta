const KEYS = [
  "heroEyebrow","heroTitle","heroLead",
  "hoursWeek","hoursSat","hoursSun","hoursNote",
  "mapIntro","mapEmbedUrl",
  "contactLead","contactPhone","contactEmail","contactAddress"
];

async function loadBase() {
  const res = await fetch("../content.json");
  return res.json();
}

function collect() {
  const obj = {};
  KEYS.forEach((k) => {
    const el = document.getElementById(k);
    obj[k] = el ? el.value : "";
  });
  return obj;
}

function fill(data) {
  KEYS.forEach((k) => {
    const el = document.getElementById(k);
    if (el) el.value = data[k] || "";
  });
}

function downloadJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "content.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function init() {
  const base = await loadBase();
  fill(base);

  document.getElementById("previewBtn").addEventListener("click", () => {
    localStorage.setItem("fotkaContentOverride", JSON.stringify(collect()));
    alert("Podgląd zapisany lokalnie. Odśwież stronę główną.");
  });

  document.getElementById("downloadBtn").addEventListener("click", () => {
    downloadJson(collect());
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    localStorage.removeItem("fotkaContentOverride");
    alert("Wyczyszczono podgląd lokalny.");
  });
}

init();
