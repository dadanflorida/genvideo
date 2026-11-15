/* =====================================================================
 * GenVideo — logika UI: kelola slide, pratinjau, dan generate video.
 * ===================================================================== */
(function () {
  'use strict';

  // ---------- State ----------
  const state = {
    slides: [],
    nextId: 1,
    imageCache: new Map(), // id -> HTMLImageElement
    generating: false
  };

  // ---------- Referensi DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const slideListEl = $('#slide-list');
  const addBtn = $('#add-slide-btn');
  const generateBtn = $('#generate-btn');
  const downloadLink = $('#download-link');
  const progressWrap = $('#progress-wrap');
  const progressFill = $('#progress-fill');
  const progressText = $('#progress-text');
  const previewCanvas = $('#preview');
  const previewPlayBtn = $('#preview-play');
  const previewPauseBtn = $('#preview-pause');
  const previewSeek = $('#preview-seek');
  const previewCurrentTime = $('#preview-current-time');
  const previewTotalTime = $('#preview-total-time');
  const audioInput = $('#audio');
  const audioNameEl = $('#audio-name');

  // ---------- Utilitas ----------
  function uid() { return state.nextId++; }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('Gagal membaca file'));
      fr.readAsDataURL(file);
    });
  }

  function loadImageForPreview(id, dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { state.imageCache.set(id, img); resolve(img); };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  // ---------- Pratinjau ----------
  async function refreshPreview() {
    const first = state.slides[0];
    if (!first) {
      const ctx = previewCanvas.getContext('2d');
      ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      return;
    }

    let imgEl = state.imageCache.get(first.id) || null;
    if (first.image && !imgEl) {
      imgEl = await loadImageForPreview(first.id, first.image);
    }

    const opts = {
      width: previewCanvas.width,
      height: previewCanvas.height,
      textColor: $('#textcolor').value
    };
    VideoGenerator.renderPreview(previewCanvas, first, opts, imgEl);
  }
// ---------- Mesin Putar Pratinjau ----------
let previewPlaying = false;
let previewAnimationId = null;
let previewElapsed = 0;
let previewStartTime = 0;

function drawPreviewFrame(elapsed) {
  let acc = 0;
  let index = 0;
  let localT = 0;

  for (let i = 0; i < state.slides.length; i++) {
    const duration = Math.max(
      0.5,
      Number(state.slides[i].duration) || 3
    );

    if (elapsed < acc + duration) {
      index = i;
      localT = elapsed - acc;
      break;
    }

    acc += duration;
    index = i;
    localT = duration;
  }

  const slide = state.slides[index];
  if (!slide) return;

  const progress = Math.min(1, localT / 2);

  const imgEl = slide.image
    ? state.imageCache.get(slide.id) || null
    : null;

  VideoGenerator.renderPreview(
    previewCanvas,
    slide,
    {
      width: previewCanvas.width,
      height: previewCanvas.height,
      textColor: $('#textcolor').value
    },
    imgEl,
    progress
  );
}

function formatPreviewTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);

  return String(min).padStart(2, '0') + ':' +
         String(sec).padStart(2, '0');
}
  
async function playPreview() {
  if (previewPlaying || state.slides.length === 0) return;

  // Pastikan semua gambar sudah dimuat
  for (const slide of state.slides) {
    if (slide.image && !state.imageCache.has(slide.id)) {
      await loadImageForPreview(slide.id, slide.image);
    }
  }

  previewPlaying = true;
  console.log('PEMUTAR DIMULAI');
  previewStartTime = performance.now() - previewElapsed * 1000;

  function tick() {
    if (!previewPlaying) return;

    previewElapsed =
      (performance.now() - previewStartTime) / 1000;

    const totalDuration = state.slides.reduce(
      (total, slide) =>
        total + Math.max(0.5, Number(slide.duration) || 3),
      0
    );

    previewSeek.max = totalDuration;
previewSeek.value = previewElapsed;

function formatPreviewTime(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);

  return String(min).padStart(2, '0') + ':' +
         String(sec).padStart(2, '0');
}

previewCurrentTime.textContent =
  formatPreviewTime(previewElapsed);

previewTotalTime.textContent =
  formatPreviewTime(totalDuration);

    if (previewElapsed >= totalDuration) {
      previewPlaying = false;
      previewElapsed = 0;
      previewAnimationId = null;
      refreshPreview();
      return;
    }

    drawPreviewFrame(previewElapsed);
    previewAnimationId = requestAnimationFrame(tick);
  }

  previewAnimationId = requestAnimationFrame(tick);
}

function pausePreview() {
  previewPlaying = false;

  if (previewAnimationId !== null) {
    cancelAnimationFrame(previewAnimationId);
    previewAnimationId = null;
  }
}

previewPlayBtn.addEventListener('click', playPreview);

previewPauseBtn.addEventListener('click', pausePreview);

  
  // ---------- Render daftar slide ----------
  function renderSlides() {
    slideListEl.innerHTML = '';
    state.slides.forEach((slide, idx) => {
      slideListEl.appendChild(buildSlideCard(slide, idx));
    });
    refreshPreview();
  }

  function buildSlideCard(slide, idx) {
    const card = document.createElement('div');
    card.className = 'slide-card';

    // Thumbnail
    const thumb = document.createElement('div');
    thumb.className = 'slide-thumb';
    if (slide.image) {
      const img = document.createElement('img');
      img.src = slide.image;
      img.alt = 'thumbnail';
      thumb.appendChild(img);
    } else {
      thumb.textContent = '🖼️';
    }

    // Body
    const body = document.createElement('div');
    body.className = 'slide-body';

    // Input gambar
    const imgField = document.createElement('div');
    imgField.className = 'field';
    const imgLabel = document.createElement('label');
    imgLabel.textContent = 'Gambar (opsional)';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataURL(file);
        slide.image = dataUrl;
        state.imageCache.delete(slide.id);
        renderSlides();
      } catch (err) {
        alert(err.message);
      }
    });
    imgField.appendChild(imgLabel);
    imgField.appendChild(fileInput);

    // Judul
    const titleField = document.createElement('div');
    titleField.className = 'field';
    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Judul';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.placeholder = 'Judul slide…';
    titleInput.value = slide.title || '';
    titleInput.addEventListener('input', () => {
      slide.title = titleInput.value;
      if (idx === 0) refreshPreview();
    });
    titleField.appendChild(titleLabel);
    titleField.appendChild(titleInput);

    // Subjudul
    const subField = document.createElement('div');
    subField.className = 'field';
    const subLabel = document.createElement('label');
    subLabel.textContent = 'Subjudul';
    const subInput = document.createElement('input');
    subInput.type = 'text';
    subInput.placeholder = 'Subjudul (opsional)…';
    subInput.value = slide.subtitle || '';
    subInput.addEventListener('input', () => {
      slide.subtitle = subInput.value;
      if (idx === 0) refreshPreview();
    });
    subField.appendChild(subLabel);
    subField.appendChild(subInput);

// Pilihan animasi teks
const animField = document.createElement('div');
animField.className = 'field';

const animLabel = document.createElement('label');
animLabel.textContent = 'Animasi Teks';

const animSelect = document.createElement('select');

const animOptions = [
  { value: 'none', text: 'Tanpa Animasi' },
  { value: 'fade', text: 'Fade In' },
  { value: 'zoom', text: 'Zoom In' },
  { value: 'slideUp', text: 'Slide Up' }
];

animOptions.forEach(option => {
  const opt = document.createElement('option');
  opt.value = option.value;
  opt.textContent = option.text;
  animSelect.appendChild(opt);
});

animSelect.value = slide.animation || 'none';

animSelect.addEventListener('change', () => {
  slide.animation = animSelect.value;
 console.log('ANIMASI:', slide.animation);
  if (idx === 0) refreshPreview();
});

animField.appendChild(animLabel);
animField.appendChild(animSelect);
    
    // Baris: durasi + tombol
    const row = document.createElement('div');
    row.className = 'slide-row';

    const durInput = document.createElement('input');
    durInput.type = 'number';
    durInput.min = '0.5';
    durInput.step = '0.5';
    durInput.value = slide.duration;
    durInput.className = 'duration';
    durInput.title = 'Durasi (detik)';
    durInput.addEventListener('input', () => {
      const v = parseFloat(durInput.value);
      slide.duration = isFinite(v) && v > 0 ? v : 3;
    });

    const upBtn = makeIconBtn('↑', 'Pindah ke atas', () => moveSlide(idx, -1));
    upBtn.disabled = idx === 0;
    const downBtn = makeIconBtn('↓', 'Pindah ke bawah', () => moveSlide(idx, 1));
    downBtn.disabled = idx === state.slides.length - 1;
    const delBtn = makeIconBtn('🗑', 'Hapus slide', () => removeSlide(slide.id), true);

    row.appendChild(durInput);
    row.appendChild(upBtn);
    row.appendChild(downBtn);
    row.appendChild(delBtn);

    body.appendChild(imgField);
    body.appendChild(titleField);
    body.appendChild(subField);
    body.appendChild(animField);
    body.appendChild(row);

    card.appendChild(thumb);
    card.appendChild(body);
    return card;
  }

  function makeIconBtn(text, title, onClick, danger) {
    const b = document.createElement('button');
    b.className = 'icon-btn' + (danger ? ' danger' : '');
    b.textContent = text;
    b.title = title;
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------- Operasi slide ----------
  function addSlide() {
    state.slides.push({
      id: uid(),
      image: null,
      title: 'Slide ' + state.slides.length,
      subtitle: '',
      duration: 3
    });
    renderSlides();
  }

  function removeSlide(id) {
    state.slides = state.slides.filter(s => s.id !== id);
    state.imageCache.delete(id);
    renderSlides();
  }

  function moveSlide(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= state.slides.length) return;
    const arr = state.slides;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    renderSlides();
  }

  // ---------- Audio latar ----------
  audioInput.addEventListener('change', () => {
    const file = audioInput.files[0];
    audioNameEl.textContent = file ? '🎵 ' + file.name : '';
  });

  // ---------- Generate ----------
  generateBtn.addEventListener('click', async () => {
    if (state.generating) return;
    if (state.slides.length === 0) {
      alert('Tambahkan minimal 1 slide dulu.');
      return;
    }

    const [width, height] = $('#resolution').value.split(',').map(Number);
    const fps = parseInt($('#fps').value, 10);

    state.generating = true;
    generateBtn.disabled = true;
    downloadLink.style.display = 'none';
    progressWrap.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    try {
      const result = await VideoGenerator.generate({
        slides: state.slides,
        width,
        height,
        fps,
        transition: $('#transition').value,
        textColor: $('#textcolor').value,
        audioFile: audioInput.files[0] || null,
        onProgress: (p) => {
          const pct = Math.round(p * 100);
          progressFill.style.width = pct + '%';
          progressText.textContent = pct + '%';
        }
      });

      downloadLink.href = result.url;
      downloadLink.style.display = 'block';
      progressText.textContent = 'Selesai! ✅';
    } catch (err) {
      console.error(err);
      alert('Gagal generate video: ' + err.message);
      progressWrap.style.display = 'none';
    } finally {
      state.generating = false;
      generateBtn.disabled = false;
    }
  });

  // ---------- Init ----------
  addBtn.addEventListener('click', addSlide);
  $('#textcolor').addEventListener('input', refreshPreview);

  // Slide awal
  addSlide();
})();
 
