window.PIXI = PIXI;
const { Application } = PIXI;
const { Live2DModel } = PIXI.live2d;
const path = require('path');
const { ipcRenderer } = require('electron');

function createExitButton() {
  const container = document.getElementById('exit-button-container');
  const exitBtn = document.getElementById('exit-button');
  if (!exitBtn || !container) return;
  exitBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    ipcRenderer.send('exit-app');
  });
  window.addEventListener('mousemove', (e) => {
    const shouldShow = e.clientY < 50 && e.clientX > window.innerWidth - 50;
    container.style.display = shouldShow ? 'block' : 'none';
  });
}

const resolution = window.devicePixelRatio || 1;

const app = new Application({
  width: Math.floor(window.innerWidth * resolution),
  height: Math.floor(window.innerHeight * resolution),
  autoStart: true,
  transparent: true,
  antialias: true,
  resolution: resolution,  // 使用设备像素比
  backgroundAlpha: 0
});
app.view.style.width = `${window.innerWidth}px`;
app.view.style.height = `${window.innerHeight}px`;
document.getElementById('live2d-container').appendChild(app.view);
app.renderer.backgroundColor = 0x000000;
app.renderer.backgroundAlpha = 0;

let currentModel = null;
const debounce = (fn, ms) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
};

ipcRenderer.on('init-model', (event, modelPath) => loadModel(modelPath));
ipcRenderer.on('change-model', (event, modelPath) => {
  if (currentModel) {
    currentModel.destroy();
    app.stage.removeChild(currentModel);
  }
  loadModel(modelPath);
});

async function loadModel(modelPath) {
  try {
    createExitButton();
    document.addEventListener('contextmenu', e => e.preventDefault());
    const model = await Live2DModel.from(modelPath);
    app.stage.addChild(model);

    const calculateScale = () => {
      const baseScale = 0.4;
      const scaleX = (app.screen.width) / model.width;
      const scaleY = (app.screen.height) / model.height;
      return Math.min(scaleX, scaleY, baseScale);
    };
    
    const initialScale = calculateScale();
    model.scale.set(initialScale);
    model.x = app.screen.width / 2;
    model.y = app.screen.height / 2;
    model.anchor.set(0.5, 0.5);
    
    const handleResize = debounce(() => {
      app.renderer.resize(app.screen.width, app.screen.height);
      model.x = app.screen.width / 2;
      model.y = app.screen.height / 2;
    }, 250);
    window.addEventListener('resize', handleResize);
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    const startDrag = (x, y) => {
      isDragging = true;
      lastX = x;
      lastY = y;
    };
    const endDrag = () => isDragging = false;
    const doDrag = (x, y) => {
      if (isDragging) {
        const deltaX = x - lastX;
        const deltaY = y - lastY;
        if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
          ipcRenderer.send('drag-window', { deltaX, deltaY });
          lastX = x;
          lastY = y;
        }
      }
    };
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) startDrag(e.screenX, e.screenY);
    }, { passive: true });
    document.addEventListener('mousemove', (e) => doDrag(e.screenX, e.screenY), { passive: true });
    document.addEventListener('mouseup', endDrag, { passive: true });
    document.addEventListener('mouseleave', endDrag, { passive: true });
    document.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) startDrag(e.touches[0].screenX, e.touches[0].screenY);
    }, { passive: false });
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) doDrag(e.touches[0].screenX, e.touches[0].screenY);
    }, { passive: false });
    document.addEventListener('touchend', endDrag, { passive: true });
    currentModel = model;
  } catch (error) {
    console.error('Error loading model:', error);
  }
}
loadModel();