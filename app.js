const W = 480, H = 800;
const RATIO = W / H;

const $ = (id) => document.getElementById(id);
const fileInput = $('file'), stage = $('stage'), empty = $('empty');
const imgEl = $('img'), cropEl = $('crop');
const zoomEl = $('zoom'), saveBtn = $('save'), msgEl = $('msg');

// x0/y0/zoom em coordenadas da imagem original
const s = { img: null, nw: 0, nh: 0, x0: 0, y0: 0, zoom: 1 };
let drag = null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const baseW = () => Math.min(s.nw, s.nh * RATIO);
const cropSize = () => { const cw = baseW() / s.zoom; return [cw, cw / RATIO]; };

function render() {
  const has = !!s.img;
  empty.hidden = has;
  imgEl.hidden = cropEl.hidden = !has;
  zoomEl.disabled = saveBtn.disabled = !has;
  zoomEl.value = s.zoom;
  if (!has) return;

  // imagem encaixada na caixa 16:10 (ver mockup)
  const sc = Math.min(1.6 / s.nw, 1 / s.nh);
  const fw = s.nw * sc / 1.6 * 100, fh = s.nh * sc * 100;
  const ox = (100 - fw) / 2, oy = (100 - fh) / 2;
  Object.assign(imgEl.style, { left: ox + '%', top: oy + '%', width: fw + '%', height: fh + '%' });

  const [cw, ch] = cropSize();
  Object.assign(cropEl.style, {
    left: (ox + s.x0 / s.nw * fw) + '%',
    top: (oy + s.y0 / s.nh * fh) + '%',
    width: (cw / s.nw * fw) + '%',
    height: (ch / s.nh * fh) + '%',
  });
}

function loadFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    Object.assign(s, { img, nw, nh, zoom: 1 });
    const [cw, ch] = cropSize();
    s.x0 = (nw - cw) / 2;
    s.y0 = (nh - ch) / 2;
    imgEl.src = url;
    msgEl.textContent = '';
    render();
  };
  img.onerror = () => { msgEl.textContent = 'Não foi possível ler essa imagem.'; URL.revokeObjectURL(url); };
  img.src = url;
}

fileInput.addEventListener('change', () => {
  loadFile(fileInput.files[0]);
  fileInput.value = '';
});

// permite soltar uma imagem na caixa
stage.addEventListener('dragover', (e) => e.preventDefault());
stage.addEventListener('drop', (e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });

zoomEl.addEventListener('input', () => {
  const z = parseFloat(zoomEl.value);
  if (!s.img || isNaN(z) || z === s.zoom) return;
  const [ow, oh] = cropSize();
  const cx = s.x0 + ow / 2, cy = s.y0 + oh / 2;
  s.zoom = z;
  const [cw, ch] = cropSize();
  s.x0 = clamp(cx - cw / 2, 0, s.nw - cw);
  s.y0 = clamp(cy - ch / 2, 0, s.nh - ch);
  render();
});

cropEl.addEventListener('pointerdown', (e) => {
  const h = stage.getBoundingClientRect().height;
  const sc = Math.min(1.6 / s.nw, 1 / s.nh);
  drag = { sx: e.clientX, sy: e.clientY, x0: s.x0, y0: s.y0, k: 1 / (sc * h) };
  cropEl.setPointerCapture(e.pointerId);
  e.preventDefault();
});
cropEl.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const [cw, ch] = cropSize();
  s.x0 = clamp(drag.x0 + (e.clientX - drag.sx) * drag.k, 0, s.nw - cw);
  s.y0 = clamp(drag.y0 + (e.clientY - drag.sy) * drag.k, 0, s.nh - ch);
  render();
});
const endDrag = () => { drag = null; };
cropEl.addEventListener('pointerup', endDrag);
cropEl.addEventListener('pointercancel', endDrag);

function toBmp() {
  const [cw, ch] = cropSize();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s.img, s.x0, s.y0, cw, ch, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;

  const rowSize = Math.ceil((W * 3) / 4) * 4;
  const dataSize = rowSize * H;
  const buf = new ArrayBuffer(54 + dataSize);
  const dv = new DataView(buf);
  dv.setUint8(0, 0x42); dv.setUint8(1, 0x4d);   // "BM"
  dv.setUint32(2, 54 + dataSize, true);
  dv.setUint32(10, 54, true);                    // offset dos pixels
  dv.setUint32(14, 40, true);                    // BITMAPINFOHEADER
  dv.setInt32(18, W, true);
  dv.setInt32(22, H, true);                      // positivo = bottom-up
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, dataSize, true);
  dv.setInt32(38, 2835, true);
  dv.setInt32(42, 2835, true);

  const out = new Uint8Array(buf);
  for (let y = 0; y < H; y++) {
    let o = 54 + (H - 1 - y) * rowSize;
    let i = y * W * 4;
    for (let x = 0; x < W; x++, i += 4) {
      out[o++] = px[i + 2];
      out[o++] = px[i + 1];
      out[o++] = px[i];
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}

saveBtn.addEventListener('click', () => {
  if (!s.img) return;
  const url = URL.createObjectURL(toBmp());
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wallpaper-x4.bmp';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  msgEl.textContent = 'wallpaper-x4.bmp gerado (480 × 800, 24-bit).';
});

render();
