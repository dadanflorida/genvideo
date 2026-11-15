/* =====================================================================
 * GenVideo — mesin rendering & perekaman video
 * Menggambar slide (gambar + teks) ke <canvas> lalu merekam real-time
 * dengan MediaRecorder menjadi file WebM. Mendukung audio latar.
 * ===================================================================== */
(function (global) {
  'use strict';

  const VideoGenerator = {};

  /* ---------- Utilitas ---------- */

  // Muat dataURL / blob menjadi HTMLImageElement
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Gagal memuat gambar'));
      img.src = src;
    });
  }

  // Bungkus teks agar muat dalam maxWidth
  function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // Gambar dengan mode cover (isi penuh, crop tengah)
  function drawCover(ctx, img, w, h) {
    const ir = img.width / img.height;
    const cr = w / h;
    let dw, dh;
    if (ir > cr) {
      dh = h;
      dw = h * ir;
    } else {
      dw = w;
      dh = w / ir;
    }
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  // Latar gradien default
  function drawBackground(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#232838');
    g.addColorStop(1, '#0f1117');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

     /* ---------- Render satu slide (statis) ---------- */
  // slide: { image (dataURL|null), title, subtitle, duration }
  // opts: { width, height, textColor }
   function renderSlide(ctx, slide, opts, imgEl, progress = 1) {
  const w = opts.width;
  const h = opts.height;

  if (imgEl) {
    drawCover(ctx, imgEl, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, 0, w, h);
  } else {
    drawBackground(ctx, w, h);
  }

  const textColor = opts.textColor || '#ffffff';
  const animation = slide.animation || 'none';

  progress = Math.max(0, Math.min(1, progress));

  function prepareText() {
    ctx.save();

    if (animation === 'fade') {
     ctx.globalAlpha = progress;
      console.log('FADE PROGRESS:', progress);
    }

    if (animation === 'zoom') {
      const scale = 0.5 + progress * 0.5;
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-w / 2, -h / 2);
    }

    if (animation === 'slideUp') {
      ctx.translate(0, (1 - progress) * 100);
    }
  }

  // Judul
  if (slide.title) {
    prepareText();

    const titleSize = Math.round(Math.min(w, h) * 0.07);

    ctx.font = '700 ' + titleSize +
      'px "Segoe UI", system-ui, Arial, sans-serif';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = wrapText(ctx, slide.title, w * 0.82);
    const lineH = titleSize * 1.25;
    const startY = h * 0.32 -
      ((lines.length - 1) * lineH) / 2;

    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = textColor;

    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, startY + i * lineH);
    });

    ctx.restore();
  }

  // Subjudul
  if (slide.subtitle) {
    prepareText();

    const subSize = Math.round(Math.min(w, h) * 0.035);

    ctx.font = '400 ' + subSize +
      'px "Segoe UI", system-ui, Arial, sans-serif';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = wrapText(ctx, slide.subtitle, w * 0.78);
    const lineH = subSize * 1.4;
    const startY = h * 0.6 -
      ((lines.length - 1) * lineH) / 2;

    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';

    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, startY + i * lineH);
    });

    ctx.restore();
  }
}

  /* ---------- API publik: render untuk pratinjau ---------- */
  VideoGenerator.renderPreview = function (canvas, slide, opts, imgEl) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderSlide(ctx, slide, opts, imgEl);
  };

  /* ---------- Generate video ---------- */
  // config: { slides, width, height, fps, transition, textColor,
  //           audioFile, onProgress }
  // returns Promise<{ blob, url }>
  VideoGenerator.generate = async function (config) {
    const { slides, width, height, fps } = config;
    const transition = config.transition === 'fade' ? 'fade' : 'none';
    const onProgress = config.onProgress || (() => {});

    // 1. Muat semua gambar
    const images = [];
    for (const s of slides) {
      if (s.image) {
        try { images.push(await loadImage(s.image)); }
        catch (e) { images.push(null); }
      } else {
        images.push(null);
      }
    }

    // 2. Siapkan canvas offscreen untuk setiap slide
const offscreens = slides.map(() => {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
});

    // 3. Total durasi
    const durations = slides.map(s => Math.max(0.5, Number(s.duration) || 3));
    const totalDuration = durations.reduce((a, b) => a + b, 0);
    const fadeMs = transition === 'fade' ? Math.min(500, Math.min(...durations) * 1000 * 0.4) : 0;

    // 4. Canvas utama + stream video
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const videoStream = canvas.captureStream(fps);

    // 5. Audio latar (opsional)
    let audioCtx = null;
    let audioSource = null;
    let audioTracks = [];
    if (config.audioFile) {
      try {
        const buf = await config.audioFile.arrayBuffer();
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(buf);
        const dest = audioCtx.createMediaStreamDestination();
        audioSource = audioCtx.createBufferSource();
        audioSource.buffer = decoded;
        audioSource.connect(dest);
        audioTracks = dest.stream.getAudioTracks();
      } catch (e) {
        audioCtx = null;
        audioSource = null;
        audioTracks = [];
        console.warn('Audio latar gagal dimuat, lanjut tanpa audio.', e);
      }
    }

    const tracks = videoStream.getVideoTracks().concat(audioTracks);
    const combined = new MediaStream(tracks);

    // 6. MediaRecorder
    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    let mimeType = '';
    for (const m of mimeTypes) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
        mimeType = m;
        break;
      }
    }
    const recorder = new MediaRecorder(combined, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 8_000_000
    });

    const chunks = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

    const done = new Promise((resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
        resolve({ blob, url: URL.createObjectURL(blob) });
      };
      recorder.onerror = e => reject(e.error || new Error('Rekaman gagal'));
    });

    // 7. Hitung indeks slide untuk waktu t (detik)
    function slideAt(t) {
      let acc = 0;
      for (let i = 0; i < durations.length; i++) {
        acc += durations[i];
        if (t < acc) return { index: i, localT: t - (acc - durations[i]) };
      }
      return { index: durations.length - 1, localT: durations[durations.length - 1] };
    }

    // 8. Gambar satu frame
    function drawFrame(t) {
  const { index, localT } = slideAt(t);

  const durMs = durations[index] * 1000;
  const localMs = localT * 1000;

  // Durasi animasi teks: 2000 milidetik
  const animProgress = Math.min(1, localMs / 2000);

  // Render slide utama
  const currentCanvas = offscreens[index];
  const currentCtx = currentCanvas.getContext('2d');

  currentCtx.clearRect(0, 0, width, height);

  renderSlide(
    currentCtx,
    slides[index],
    {
      width,
      height,
      textColor: config.textColor
    },
    images[index],
    animProgress
  );

  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.drawImage(currentCanvas, 0, 0);

  // Transisi fade ke slide berikutnya
  if (
    fadeMs > 0 &&
    index < offscreens.length - 1 &&
    localMs > durMs - fadeMs
  ) {
    const alpha = Math.min(
      1,
      (localMs - (durMs - fadeMs)) / fadeMs
    );

    const nextCanvas = offscreens[index + 1];
    const nextCtx = nextCanvas.getContext('2d');

    nextCtx.clearRect(0, 0, width, height);

    renderSlide(
      nextCtx,
      slides[index + 1],
      {
        width,
        height,
        textColor: config.textColor
      },
      images[index + 1],
      alpha
    );

    ctx.globalAlpha = alpha;
    ctx.drawImage(nextCanvas, 0, 0);
    ctx.globalAlpha = 1;
  }
}

    // 9. Jalankan rekaman
    recorder.start(200);
    if (audioSource && audioCtx) {
      audioSource.start(0);
    }

    const t0 = performance.now();
    await new Promise((resolve) => {
      function tick() {
        const elapsed = (performance.now() - t0) / 1000;
        if (elapsed >= totalDuration) {
          drawFrame(totalDuration - 0.001);
          resolve();
          return;
        }
        drawFrame(elapsed);
        onProgress(Math.min(1, elapsed / totalDuration));
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    // 10. Berhenti
    recorder.stop();
    if (audioSource && audioCtx) {
      try { audioSource.stop(); } catch (e) {}
      setTimeout(() => { try { audioCtx.close(); } catch (e) {} }, 300);
    }

    const result = await done;
    onProgress(1);
    return result;
  };

  global.VideoGenerator = VideoGenerator;
})(window);
  
