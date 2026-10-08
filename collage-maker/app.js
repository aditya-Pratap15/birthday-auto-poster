/**
 * RetroLegend Studio - High-End Celebrity Collage Maker Engine
 * Pure Vanilla JavaScript & HTML5 Canvas Engine
 */

(function () {
  'use strict';

  // --- State Management ---
  const state = {
    canvasWidth: 1080,
    canvasHeight: 1440,
    aspectRatio: '3:4',
    zoom: 0.5, // viewport display scale
    
    // Background state
    bgType: 'preset', // 'preset' or 'custom'
    bgPreset: 'noir',
    bgCustomImage: null,
    bgCustomImageData: null,
    bgDarkOverlay: 0.2,
    bgVignette: 0.5,

    // Frames (Photo Slots)
    frames: [],
    selectedFrameId: null,

    // Text Layers
    textLayers: [],
    selectedTextId: null,

    // Floating Stickers & Reaction Overlays
    stickers: [],
    selectedStickerId: null,

    // Story Teaser Hook Card
    teaserCard: null,

    // Undo / Redo stacks
    history: [],
    historyIndex: -1,

    // Interaction tracking
    dragTarget: null, // { type: 'frame'|'text'|'sticker'|'teaserCard', id, startX, startY, origX, origY, origW, origH, handle }
    isDragging: false,
    isResizing: false,
    isRotating: false,
    activeHandle: null
  };

  // DOM Elements
  const canvas = document.getElementById('collageCanvas');
  const ctx = canvas.getContext('2d');
  const canvasWrapper = document.getElementById('canvasWrapper');
  const canvasScrollContainer = document.getElementById('canvasScrollContainer');
  const selectionOverlay = document.getElementById('selectionOverlay');
  const toastNotification = document.getElementById('toastNotification');

  // Sidebar Controls
  const framesListEl = document.getElementById('framesList');
  const frameCountBadge = document.getElementById('frameCountBadge');
  const frameEditorControls = document.getElementById('frameEditorControls');
  const noFrameSelectedHint = document.getElementById('noFrameSelectedHint');

  const textEditorControls = document.getElementById('textEditorControls');
  const noTextSelectedHint = document.getElementById('noTextSelectedHint');

  // --- Helper: ID Generator ---
  function uid(prefix = 'item') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }

  // --- Toast Notification ---
  function showToast(msg) {
    toastNotification.textContent = msg;
    toastNotification.classList.add('show');
    setTimeout(() => toastNotification.classList.remove('show'), 2600);
  }

  // --- History (Undo / Redo) ---
  function pushState() {
    // Slice forward history if we made an edit after undoing
    if (state.historyIndex < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIndex + 1);
    }
    
    // Snapshot lightweight JSON state
    const snapshot = {
      canvasWidth: state.canvasWidth,
      canvasHeight: state.canvasHeight,
      aspectRatio: state.aspectRatio,
      bgType: state.bgType,
      bgPreset: state.bgPreset,
      bgCustomImage: state.bgCustomImage,
      bgCustomImageData: state.bgCustomImageData,
      bgDarkOverlay: state.bgDarkOverlay,
      bgVignette: state.bgVignette,
      // For frames, serialize properties and image references
      frames: state.frames.map(f => ({ ...f, imgElement: f.imgElement })),
      textLayers: state.textLayers.map(t => ({ ...t })),
      stickers: state.stickers.map(s => ({ ...s, imgElement: s.imgElement })),
      teaserCard: state.teaserCard ? { ...state.teaserCard } : null
    };

    state.history.push(snapshot);
    state.historyIndex++;
    if (state.history.length > 30) {
      state.history.shift();
      state.historyIndex--;
    }
  }

  function undo() {
    if (state.historyIndex > 0) {
      state.historyIndex--;
      restoreState(state.history[state.historyIndex]);
      showToast('Undo');
    }
  }

  function redo() {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      restoreState(state.history[state.historyIndex]);
      showToast('Redo');
    }
  }

  function restoreState(snapshot) {
    state.canvasWidth = snapshot.canvasWidth;
    state.canvasHeight = snapshot.canvasHeight;
    state.aspectRatio = snapshot.aspectRatio;
    canvas.width = state.canvasWidth;
    canvas.height = state.canvasHeight;

    state.bgType = snapshot.bgType || 'preset';
    state.bgPreset = snapshot.bgPreset || 'noir';
    state.bgCustomImage = snapshot.bgCustomImage || null;
    state.bgCustomImageData = snapshot.bgCustomImageData || null;
    state.bgDarkOverlay = snapshot.bgDarkOverlay;
    state.bgVignette = snapshot.bgVignette;

    state.frames = snapshot.frames.map(f => ({ ...f }));
    state.textLayers = snapshot.textLayers.map(t => ({ ...t }));
    state.stickers = (snapshot.stickers || []).map(s => ({ ...s }));
    state.teaserCard = snapshot.teaserCard ? { ...snapshot.teaserCard } : null;

    state.selectedFrameId = null;
    state.selectedTextId = null;
    state.selectedStickerId = null;

    updateUI();
    renderCanvas();
  }

  // --- Preset Template Generators ---
  function loadPresetDiamond() {
    // 4 background quadrants + 1 center gold diamond (Kate Winslet style)
    const W = state.canvasWidth;
    const H = state.canvasHeight;
    const gap = 12;
    const halfW = (W - gap * 3) / 2;
    const halfH = (H - gap * 3) / 2;

    state.frames = [
      {
        id: uid('frame'),
        label: 'Top-Left Era',
        x: gap,
        y: gap,
        width: halfW,
        height: halfH,
        shape: 'gold_rect',
        borderWidth: 4,
        borderColor: '#d4af37',
        cornerRadius: 4,
        shadowBlur: 10,
        imgElement: null,
        imgScale: 1,
        imgPanX: 0,
        imgPanY: 0
      },
      {
        id: uid('frame'),
        label: 'Top-Right Era',
        x: halfW + gap * 2,
        y: gap,
        width: halfW,
        height: halfH,
        shape: 'gold_rect',
        borderWidth: 4,
        borderColor: '#d4af37',
        cornerRadius: 4,
        shadowBlur: 10,
        imgElement: null,
        imgScale: 1,
        imgPanX: 0,
        imgPanY: 0
      },
      {
        id: uid('frame'),
        label: 'Bottom-Left Era',
        x: gap,
        y: halfH + gap * 2,
        width: halfW,
        height: halfH,
        shape: 'gold_rect',
        borderWidth: 4,
        borderColor: '#d4af37',
        cornerRadius: 4,
        shadowBlur: 10,
        imgElement: null,
        imgScale: 1,
        imgPanX: 0,
        imgPanY: 0
      },
      {
        id: uid('frame'),
        label: 'Bottom-Right Era',
        x: halfW + gap * 2,
        y: halfH + gap * 2,
        width: halfW,
        height: halfH,
        shape: 'gold_rect',
        borderWidth: 4,
        borderColor: '#d4af37',
        cornerRadius: 4,
        shadowBlur: 10,
        imgElement: null,
        imgScale: 1,
        imgPanX: 0,
        imgPanY: 0
      },
      // Elevated Center Diamond Hero
      {
        id: uid('frame'),
        label: '★ Center Diamond Hero',
        x: W / 2 - 270,
        y: H / 2 - 270,
        width: 540,
        height: 540,
        shape: 'diamond',
        borderWidth: 12,
        borderColor: '#d4af37',
        cornerRadius: 0,
        shadowBlur: 35,
        imgElement: null,
        imgScale: 1.15,
        imgPanX: 0,
        imgPanY: 0
      }
    ];

    // Signature Text Layer
    state.textLayers = [
      {
        id: uid('text'),
        text: 'Elisabeth Shue',
        fontFamily: "'Great Vibes', cursive",
        fontSize: 72,
        color: '#f7e7b4',
        x: W / 2,
        y: H / 2 + 320,
        align: 'center',
        glow: 16,
        letterSpacing: 1
      }
    ];

    state.selectedFrameId = state.frames[4].id; // Select center diamond
    pushState();
    updateUI();
    renderCanvas();
    showToast('Loaded Diamond Hero Template');
  }

  function loadPresetBoxCenterpiece() {
    // 6-photo grid + elevated center box (Susan Sarandon style)
    const W = state.canvasWidth;
    const H = state.canvasHeight;
    const pad = 12;
    const colW = (W - pad * 3) / 2;
    const rowH = (H - pad * 4) / 3;

    state.frames = [
      { id: uid('frame'), label: 'Top Left', x: pad, y: pad, width: colW, height: rowH, shape: 'white_rect', borderWidth: 4, borderColor: '#ffffff', cornerRadius: 0, shadowBlur: 8, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Top Right', x: colW + pad * 2, y: pad, width: colW, height: rowH, shape: 'white_rect', borderWidth: 4, borderColor: '#ffffff', cornerRadius: 0, shadowBlur: 8, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Mid Left', x: pad, y: rowH + pad * 2, width: colW, height: rowH, shape: 'white_rect', borderWidth: 4, borderColor: '#ffffff', cornerRadius: 0, shadowBlur: 8, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Mid Right', x: colW + pad * 2, y: rowH + pad * 2, width: colW, height: rowH, shape: 'white_rect', borderWidth: 4, borderColor: '#ffffff', cornerRadius: 0, shadowBlur: 8, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Bottom Left', x: pad, y: (rowH * 2) + pad * 3, width: colW, height: rowH, shape: 'white_rect', borderWidth: 4, borderColor: '#ffffff', cornerRadius: 0, shadowBlur: 8, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Bottom Right', x: colW + pad * 2, y: (rowH * 2) + pad * 3, width: colW, height: rowH, shape: 'white_rect', borderWidth: 4, borderColor: '#ffffff', cornerRadius: 0, shadowBlur: 8, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      // Center Framed Hero Box
      {
        id: uid('frame'),
        label: '★ Center Hero Box',
        x: W / 2 - 250,
        y: H / 2 - 320,
        width: 500,
        height: 640,
        shape: 'white_rect',
        borderWidth: 14,
        borderColor: '#ffffff',
        cornerRadius: 4,
        shadowBlur: 30,
        imgElement: null,
        imgScale: 1.1,
        imgPanX: 0,
        imgPanY: 0
      }
    ];

    state.textLayers = [
      {
        id: uid('text'),
        text: 'Susan Sarandon',
        fontFamily: "'Great Vibes', cursive",
        fontSize: 68,
        color: '#ffffff',
        x: W / 2,
        y: H / 2 + 270,
        align: 'center',
        glow: 20,
        letterSpacing: 1
      }
    ];

    state.selectedFrameId = state.frames[6].id;
    pushState();
    updateUI();
    renderCanvas();
    showToast('Loaded Box Centerpiece Template');
  }

  function loadPresetOvalCameo() {
    // Janis Joplin style: background grid with illuminated oval cameo
    const W = state.canvasWidth;
    const H = state.canvasHeight;
    const pad = 10;
    const colW = (W - pad * 3) / 2;
    const rowH = (H - pad * 4) / 3;

    state.frames = [
      { id: uid('frame'), label: 'Early Days 1', x: pad, y: pad, width: colW, height: rowH, shape: 'gold_rect', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 2, shadowBlur: 6, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Early Days 2', x: colW + pad * 2, y: pad, width: colW, height: rowH, shape: 'gold_rect', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 2, shadowBlur: 6, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Mid Career 1', x: pad, y: rowH + pad * 2, width: colW, height: rowH, shape: 'gold_rect', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 2, shadowBlur: 6, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Mid Career 2', x: colW + pad * 2, y: rowH + pad * 2, width: colW, height: rowH, shape: 'gold_rect', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 2, shadowBlur: 6, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Late Era 1', x: pad, y: (rowH * 2) + pad * 3, width: colW, height: rowH, shape: 'gold_rect', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 2, shadowBlur: 6, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Late Era 2', x: colW + pad * 2, y: (rowH * 2) + pad * 3, width: colW, height: rowH, shape: 'gold_rect', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 2, shadowBlur: 6, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      // Center Oval Cameo
      {
        id: uid('frame'),
        label: '★ Oval Cameo Center',
        x: W / 2 - 250,
        y: H / 2 - 340,
        width: 500,
        height: 680,
        shape: 'oval',
        borderWidth: 12,
        borderColor: '#ffffff',
        cornerRadius: 0,
        shadowBlur: 35,
        imgElement: null,
        imgScale: 1.1,
        imgPanX: 0,
        imgPanY: 0
      }
    ];

    state.textLayers = [
      {
        id: uid('text'),
        text: 'Janis Joplin',
        fontFamily: "'Great Vibes', cursive",
        fontSize: 70,
        color: '#ffffff',
        x: W / 2,
        y: H / 2 + 250,
        align: 'center',
        glow: 18,
        letterSpacing: 1
      },
      {
        id: uid('text'),
        text: '1943 - 1970',
        fontFamily: "'Bodoni Moda', serif",
        fontSize: 26,
        color: '#d4af37',
        x: W / 2,
        y: H / 2 + 300,
        align: 'center',
        glow: 10,
        letterSpacing: 4
      }
    ];

    state.selectedFrameId = state.frames[6].id;
    pushState();
    updateUI();
    renderCanvas();
    showToast('Loaded Oval Cameo Template');
  }

  function loadPreset6Grid() {
    const W = state.canvasWidth;
    const H = state.canvasHeight;
    const pad = 16;
    const colW = (W - pad * 3) / 2;
    const rowH = (H - pad * 4) / 3;

    state.frames = [
      { id: uid('frame'), label: 'Frame 1 (Youth)', x: pad, y: pad, width: colW, height: rowH, shape: 'gold_rect', borderWidth: 6, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Frame 2 (Debut)', x: colW + pad * 2, y: pad, width: colW, height: rowH, shape: 'gold_rect', borderWidth: 6, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Frame 3 (Breakthrough)', x: pad, y: rowH + pad * 2, width: colW, height: rowH, shape: 'gold_rect', borderWidth: 6, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Frame 4 (Peak Classic)', x: colW + pad * 2, y: rowH + pad * 2, width: colW, height: rowH, shape: 'gold_rect', borderWidth: 6, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Frame 5 (Iconic Role)', x: pad, y: (rowH * 2) + pad * 3, width: colW, height: rowH, shape: 'gold_rect', borderWidth: 6, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 },
      { id: uid('frame'), label: 'Frame 6 (Recent Stardom)', x: colW + pad * 2, y: (rowH * 2) + pad * 3, width: colW, height: rowH, shape: 'gold_rect', borderWidth: 6, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12, imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 }
    ];

    state.textLayers = [
      {
        id: uid('text'),
        text: 'RETROSPECTIVE TRIBUTE',
        fontFamily: "'Cinzel', serif",
        fontSize: 34,
        color: '#f7e7b4',
        x: W / 2,
        y: 42,
        align: 'center',
        glow: 14,
        letterSpacing: 4
      }
    ];

    state.selectedFrameId = state.frames[0].id;
    pushState();
    updateUI();
    renderCanvas();
    showToast('Loaded 6-Photo Classic Grid');
  }

  function loadPresetViralTeaser() {
    const W = state.canvasWidth;
    const H = state.canvasHeight;
    state.bgType = 'preset';
    state.bgPreset = 'ivory_editorial';
    state.bgDarkOverlay = 0.0;
    state.bgVignette = 0.0;

    // 1 Hero Half-Body Photo + 4 Milestone Polaroid Cards with realistic tilts
    state.frames = [
      {
        id: uid('frame'),
        label: '★ Hero Portrait',
        x: 0,
        y: 140,
        width: 1080,
        height: 530,
        shape: 'white_rect',
        borderWidth: 0,
        borderColor: '#ffffff',
        cornerRadius: 0,
        shadowBlur: 10,
        rotation: 0,
        imgElement: null,
        imgScale: 1,
        imgPanX: 0,
        imgPanY: 0
      },
      {
        id: uid('frame'),
        label: 'Milestone 1 (Childhood)',
        x: 16,
        y: 640,
        width: 265,
        height: 325,
        shape: 'white_rect',
        borderWidth: 12,
        borderColor: '#ffffff',
        cornerRadius: 3,
        shadowBlur: 24,
        rotation: -4,
        imgElement: null,
        imgScale: 1,
        imgPanX: 0,
        imgPanY: 0
      },
      {
        id: uid('frame'),
        label: 'Milestone 2 (Teen/Debut)',
        x: 275,
        y: 665,
        width: 255,
        height: 310,
        shape: 'white_rect',
        borderWidth: 12,
        borderColor: '#ffffff',
        cornerRadius: 3,
        shadowBlur: 20,
        rotation: -1,
        imgElement: null,
        imgScale: 1,
        imgPanX: 0,
        imgPanY: 0
      },
      {
        id: uid('frame'),
        label: 'Milestone 3 (Peak Era)',
        x: 520,
        y: 670,
        width: 250,
        height: 305,
        shape: 'white_rect',
        borderWidth: 12,
        borderColor: '#ffffff',
        cornerRadius: 3,
        shadowBlur: 20,
        rotation: 2,
        imgElement: null,
        imgScale: 1,
        imgPanX: 0,
        imgPanY: 0
      },
      {
        id: uid('frame'),
        label: 'Milestone 4 (Legend Now)',
        x: 760,
        y: 655,
        width: 285,
        height: 325,
        shape: 'white_rect',
        borderWidth: 12,
        borderColor: '#ffffff',
        cornerRadius: 3,
        shadowBlur: 25,
        rotation: 3,
        imgElement: null,
        imgScale: 1,
        imgPanX: 0,
        imgPanY: 0
      }
    ];

    // Top Header & Cursive Signature
    state.textLayers = [
      {
        id: uid('text'),
        text: '—  HAPPY BIRTHDAY  —',
        fontFamily: "'Cinzel', serif",
        fontSize: 22,
        fontWeight: 700,
        color: '#b68c43',
        x: 540,
        y: 48,
        align: 'center',
        glow: 0,
        letterSpacing: 8
      },
      {
        id: uid('text'),
        text: 'BRUNO MARS',
        fontFamily: "'DM Serif Display', serif",
        fontSize: 66,
        fontWeight: 700,
        color: '#0d0d0d',
        x: 435,
        y: 102,
        align: 'right',
        glow: 0,
        letterSpacing: 2
      },
      {
        id: uid('text'),
        text: '• 41',
        fontFamily: "'DM Serif Display', serif",
        fontSize: 66,
        fontWeight: 700,
        color: '#b68c43',
        x: 455,
        y: 102,
        align: 'left',
        glow: 0,
        letterSpacing: 2
      },
      {
        id: uid('text'),
        text: 'Bruno Mars',
        fontFamily: "'Allura', cursive",
        fontSize: 72,
        fontWeight: 700,
        color: '#dfb15b',
        x: 880,
        y: 480,
        align: 'center',
        glow: 12,
        letterSpacing: 1
      }
    ];

    // Crown Sticker Emblem
    state.stickers = [
      {
        id: uid('sticker'),
        label: 'Crown Emblem',
        x: 855,
        y: 395,
        width: 60,
        height: 45,
        rotation: 0,
        opacity: 0.95,
        shadowBlur: 10,
        iconType: 'crown'
      }
    ];

    // Teaser Card Hook Box
    state.teaserCard = {
      enabled: true,
      x: 45,
      y: 1010,
      width: 990,
      height: 185,
      bgColor: '#0d0f14',
      borderColor: '#b68c43',
      borderWidth: 2,
      cornerRadius: 14,
      badgeIcon: 'crown',
      line1: 'At just 4 years old,',
      line2: 'he was already',
      line2Highlight: 'impersonating',
      line3Highlight: 'Elvis...',
      ctaText: 'Read the full story in caption →'
    };

    state.selectedFrameId = state.frames[0].id;
    pushState();
    updateUI();
    renderCanvas();
    showToast('Loaded Viral Story & Teaser Preset (Bruno Mars Style)');
  }

  // --- Dynamic Quick Frame Count Generator (4, 6, 8, 10) ---
  function setQuickFrameCount(count) {
    const W = state.canvasWidth;
    const H = state.canvasHeight;
    const pad = 12;

    // Preserve existing uploaded photos
    const existingImages = state.frames.map(f => ({
      imgElement: f.imgElement,
      imgScale: f.imgScale || 1,
      imgPanX: f.imgPanX || 0,
      imgPanY: f.imgPanY || 0
    })).filter(item => item.imgElement !== null);

    let newFrames = [];

    if (count === 4) {
      // 2 columns x 2 rows (4 balanced quadrants)
      const colW = (W - pad * 3) / 2;
      const rowH = (H - pad * 3) / 2;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          const idx = r * 2 + c;
          newFrames.push({
            id: uid('frame'),
            label: `Photo ${idx + 1}`,
            x: pad + c * (colW + pad),
            y: pad + r * (rowH + pad),
            width: colW,
            height: rowH,
            shape: 'gold_rect',
            borderWidth: 6,
            borderColor: '#d4af37',
            cornerRadius: 4,
            shadowBlur: 12,
            imgElement: existingImages[idx] ? existingImages[idx].imgElement : null,
            imgScale: existingImages[idx] ? existingImages[idx].imgScale : 1,
            imgPanX: existingImages[idx] ? existingImages[idx].imgPanX : 0,
            imgPanY: existingImages[idx] ? existingImages[idx].imgPanY : 0
          });
        }
      }
    } else if (count === 6) {
      // 2 columns x 3 rows
      const colW = (W - pad * 3) / 2;
      const rowH = (H - pad * 4) / 3;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          const idx = r * 2 + c;
          newFrames.push({
            id: uid('frame'),
            label: `Photo ${idx + 1}`,
            x: pad + c * (colW + pad),
            y: pad + r * (rowH + pad),
            width: colW,
            height: rowH,
            shape: 'gold_rect',
            borderWidth: 5,
            borderColor: '#d4af37',
            cornerRadius: 4,
            shadowBlur: 10,
            imgElement: existingImages[idx] ? existingImages[idx].imgElement : null,
            imgScale: existingImages[idx] ? existingImages[idx].imgScale : 1,
            imgPanX: existingImages[idx] ? existingImages[idx].imgPanX : 0,
            imgPanY: existingImages[idx] ? existingImages[idx].imgPanY : 0
          });
        }
      }
    } else if (count === 8) {
      // 2 columns x 4 rows
      const colW = (W - pad * 3) / 2;
      const rowH = (H - pad * 5) / 4;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 2; c++) {
          const idx = r * 2 + c;
          newFrames.push({
            id: uid('frame'),
            label: `Photo ${idx + 1}`,
            x: pad + c * (colW + pad),
            y: pad + r * (rowH + pad),
            width: colW,
            height: rowH,
            shape: 'gold_rect',
            borderWidth: 4,
            borderColor: '#d4af37',
            cornerRadius: 3,
            shadowBlur: 8,
            imgElement: existingImages[idx] ? existingImages[idx].imgElement : null,
            imgScale: existingImages[idx] ? existingImages[idx].imgScale : 1,
            imgPanX: existingImages[idx] ? existingImages[idx].imgPanX : 0,
            imgPanY: existingImages[idx] ? existingImages[idx].imgPanY : 0
          });
        }
      }
    } else if (count === 10) {
      // 2 columns x 5 rows
      const colW = (W - pad * 3) / 2;
      const rowH = (H - pad * 6) / 5;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 2; c++) {
          const idx = r * 2 + c;
          newFrames.push({
            id: uid('frame'),
            label: `Photo ${idx + 1}`,
            x: pad + c * (colW + pad),
            y: pad + r * (rowH + pad),
            width: colW,
            height: rowH,
            shape: 'gold_rect',
            borderWidth: 3,
            borderColor: '#d4af37',
            cornerRadius: 2,
            shadowBlur: 6,
            imgElement: existingImages[idx] ? existingImages[idx].imgElement : null,
            imgScale: existingImages[idx] ? existingImages[idx].imgScale : 1,
            imgPanX: existingImages[idx] ? existingImages[idx].imgPanX : 0,
            imgPanY: existingImages[idx] ? existingImages[idx].imgPanY : 0
          });
        }
      }
    }

    state.frames = newFrames;
    state.selectedFrameId = newFrames[0] ? newFrames[0].id : null;

    // Update count selector buttons
    document.querySelectorAll('.count-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.count, 10) === count);
    });

    // Deselect template pills since custom count was chosen
    document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));

    pushState();
    updateUI();
    renderCanvas();
    showToast(`Arranged ${count} Photo Frames Layout`);
  }

  // --- Rendering Pipeline ---
  function renderCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Background
    drawBackground();

    // 2. Draw Frames (sorted by layer order)
    state.frames.forEach(frame => {
      drawFrame(frame);
    });

    // 3. Draw Floating Stickers & Reaction Icons
    state.stickers.forEach(sticker => {
      drawSticker(sticker);
    });

    // 3.5 Draw Story Teaser Hook Card
    if (state.teaserCard && state.teaserCard.enabled) {
      drawTeaserCard(state.teaserCard);
    }

    // 4. Draw Text Layers
    state.textLayers.forEach(text => {
      drawTextLayer(text);
    });

    // 5. Update Selection Overlay Box
    updateSelectionOverlay();
  }

  function drawBackground() {
    const W = canvas.width;
    const H = canvas.height;

    if (state.bgType === 'custom' && state.bgCustomImage) {
      // Draw user's uploaded background with cover fit
      drawCoverImage(ctx, state.bgCustomImage, 0, 0, W, H);
    } else {
      // Draw preset backgrounds
      if (state.bgPreset === 'ivory_editorial' || state.bgPreset === 'ivory') {
        const linGrad = ctx.createLinearGradient(0, 0, 0, H);
        linGrad.addColorStop(0, '#ffffff');
        linGrad.addColorStop(0.25, '#faf8f2');
        linGrad.addColorStop(1, '#f3ede2');
        ctx.fillStyle = linGrad;
        ctx.fillRect(0, 0, W, H);
        return;
      }

      const grad = ctx.createRadialGradient(W / 2, H / 2, W * 0.1, W / 2, H / 2, W * 0.85);
      if (state.bgPreset === 'noir') {
        grad.addColorStop(0, '#1c1f2b');
        grad.addColorStop(1, '#08090d');
      } else if (state.bgPreset === 'velvet') {
        grad.addColorStop(0, '#2d112d');
        grad.addColorStop(1, '#0e0410');
      } else if (state.bgPreset === 'gold_archival') {
        grad.addColorStop(0, '#282012');
        grad.addColorStop(1, '#0b0804');
      } else if (state.bgPreset === 'slate') {
        grad.addColorStop(0, '#1a2436');
        grad.addColorStop(1, '#070b14');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // Dark tint overlay
    if (state.bgDarkOverlay > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${state.bgDarkOverlay})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Vignette shadow
    if (state.bgVignette > 0) {
      const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.4, W / 2, H / 2, W * 0.95);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, `rgba(0, 0, 0, ${state.bgVignette})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Draw an individual frame
  function drawFrame(f) {
    ctx.save();

    const { x, y, width: w, height: h, shape, borderWidth, borderColor, shadowBlur, cornerRadius, rotation } = f;

    const rot = rotation || 0;
    if (rot !== 0) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    // Apply shadow
    if (shadowBlur > 0) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = shadowBlur / 3;
    }

    // Clip according to shape
    ctx.save();
    buildShapePath(ctx, shape, x, y, w, h, cornerRadius);
    ctx.clip();

    // Fill background color of frame if no photo
    ctx.fillStyle = '#141620';
    ctx.fill();

    // Draw user photo inside the clipped path
    if (f.imgElement) {
      drawUserPhoto(ctx, f, x, y, w, h);
    } else {
      // Empty state placeholder icon & label inside the frame
      ctx.fillStyle = 'rgba(212, 175, 55, 0.15)';
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '600 18px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.label || 'Drop Photo Here', x + w / 2, y + h / 2);
    }
    ctx.restore(); // restore clipping

    // Now draw the border around the shape
    if (borderWidth > 0) {
      ctx.save();
      buildShapePath(ctx, shape, x, y, w, h, cornerRadius);

      if (shape === 'gold_rect' || (borderColor === '#d4af37' && shape !== 'white_rect')) {
        // Metallic Gold Gradient Border
        const goldGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        goldGrad.addColorStop(0, '#f9e7a8');
        goldGrad.addColorStop(0.3, '#d4af37');
        goldGrad.addColorStop(0.7, '#aa821d');
        goldGrad.addColorStop(1, '#f9e7a8');
        ctx.strokeStyle = goldGrad;
      } else {
        ctx.strokeStyle = borderColor;
      }

      ctx.lineWidth = borderWidth;
      ctx.stroke();

      // For Gold Rect, draw a secondary fine inner line
      if (shape === 'gold_rect' && borderWidth >= 6) {
        ctx.save();
        const inset = borderWidth * 0.7;
        buildShapePath(ctx, shape, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(0, cornerRadius - 2));
        ctx.strokeStyle = 'rgba(247, 231, 180, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // For White Rect, draw double frame if border >= 8px
      if (shape === 'white_rect' && borderWidth >= 8) {
        ctx.save();
        const inset = borderWidth * 0.65;
        buildShapePath(ctx, shape, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(0, cornerRadius - 2));
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }

    ctx.restore();
  }

  function buildShapePath(context, shape, x, y, w, h, r = 0) {
    context.beginPath();

    if (shape === 'diamond') {
      // 45-degree Diamond Bounding Box
      context.moveTo(x + w / 2, y);
      context.lineTo(x + w, y + h / 2);
      context.lineTo(x + w / 2, y + h);
      context.lineTo(x, y + h / 2);
      context.closePath();
    } else if (shape === 'oval') {
      // Smooth Ellipse
      context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else {
      // Rectangle (with optional corner radius)
      if (r > 0 && context.roundRect) {
        context.roundRect(x, y, w, h, r);
      } else {
        context.rect(x, y, w, h);
      }
    }
  }

  function drawUserPhoto(context, frame, frameX, frameY, frameW, frameH) {
    const img = frame.imgElement;
    const scale = frame.imgScale || 1;
    const panX = frame.imgPanX || 0;
    const panY = frame.imgPanY || 0;

    // Calculate aspect ratio covering
    const imgAspect = img.width / img.height;
    const frameAspect = frameW / frameH;

    let drawW, drawH;
    if (imgAspect > frameAspect) {
      drawH = frameH * scale;
      drawW = drawH * imgAspect;
    } else {
      drawW = frameW * scale;
      drawH = drawW / imgAspect;
    }

    const drawX = frameX + (frameW - drawW) / 2 + panX;
    
    // Top-align vertical portrait photos so heads, hair, and faces are never cut off from the top
    let drawY;
    if (drawH > frameH) {
      drawY = frameY + panY;
    } else {
      drawY = frameY + (frameH - drawH) / 2 + panY;
    }

    context.drawImage(img, drawX, drawY, drawW, drawH);
  }

  function drawSticker(s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(((s.rotation || 0) * Math.PI) / 180);
    ctx.globalAlpha = s.opacity !== undefined ? s.opacity : 1;

    if (s.shadowBlur > 0) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = s.shadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;
    }

    if (s.imgElement) {
      ctx.drawImage(s.imgElement, -s.width / 2, -s.height / 2, s.width, s.height);
    } else if (s.iconType === 'crown' || (s.label && s.label.toLowerCase().includes('crown'))) {
      drawCrownIcon(ctx, 0, 0, s.width, s.height, '#dfb15b', false);
    }
    ctx.restore();
  }

  // --- Line-Art Gold Crown Vector Renderer ---
  function drawCrownIcon(context, cx, cy, w, h, strokeColor = '#dfb15b', withRays = false) {
    context.save();
    context.strokeStyle = strokeColor;
    context.fillStyle = strokeColor;
    context.lineWidth = 2.4;
    context.lineJoin = 'round';
    context.lineCap = 'round';

    if (withRays) {
      // 5 radiant rays around crown
      const rayDist = w * 0.72;
      const angles = [-150, -115, -90, -65, -30];
      angles.forEach(deg => {
        const rad = (deg * Math.PI) / 180;
        const x1 = cx + Math.cos(rad) * (rayDist * 0.70);
        const y1 = cy + Math.sin(rad) * (rayDist * 0.70);
        const x2 = cx + Math.cos(rad) * rayDist;
        const y2 = cy + Math.sin(rad) * rayDist;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
      });
    }

    const bw = w * 0.68;
    const bh = h * 0.54;
    const topY = cy - bh / 2;
    const botY = cy + bh / 2;
    const leftX = cx - bw / 2;
    const rightX = cx + bw / 2;
    const midX = cx;

    // Crown base line
    context.beginPath();
    context.moveTo(leftX, botY);
    context.lineTo(rightX, botY);
    context.stroke();

    // Crown peaks
    context.beginPath();
    context.moveTo(leftX, botY);
    context.lineTo(leftX - 3, topY + 4);
    context.lineTo(cx - bw * 0.22, botY - bh * 0.35);
    context.lineTo(midX, topY - 3);
    context.lineTo(cx + bw * 0.22, botY - bh * 0.35);
    context.lineTo(rightX + 3, topY + 4);
    context.lineTo(rightX, botY);
    context.stroke();

    // Peak jewels
    [
      { x: leftX - 3, y: topY + 4 },
      { x: midX, y: topY - 3 },
      { x: rightX + 3, y: topY + 4 }
    ].forEach(pt => {
      context.beginPath();
      context.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      context.fill();
    });

    context.restore();
  }

  // --- Story Teaser Hook Card Renderer ---
  function drawTeaserCard(card) {
    if (!card || !card.enabled) return;

    ctx.save();

    const x = card.x || 45;
    const y = card.y || 1010;
    const w = card.width || 990;
    const h = card.height || 185;
    const r = card.cornerRadius || 14;

    // 1. Drop shadow for dark card
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;

    // 2. Card background: dark matte slate/black
    const cardBg = card.bgColor || '#0d0f14';
    ctx.fillStyle = cardBg;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
    }
    ctx.fill();

    // Reset shadow for stroke
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // 3. Subtle Gold Border outline
    ctx.strokeStyle = card.borderColor || '#b68c43';
    ctx.lineWidth = card.borderWidth || 2;
    ctx.stroke();

    // 4. Left Badge / Icon & Divider
    const badgeType = card.badgeIcon || 'crown';
    const hasBadge = badgeType !== 'none';
    let textStartX = x + 40;

    if (hasBadge) {
      const badgeCenterX = x + 85;
      const badgeCenterY = y + h / 2;

      if (badgeType === 'crown') {
        drawCrownIcon(ctx, badgeCenterX, badgeCenterY, 52, 42, '#e5a93c', true);
      } else if (badgeType === 'star') {
        ctx.save();
        ctx.fillStyle = '#e5a93c';
        ctx.font = '36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', badgeCenterX, badgeCenterY);
        ctx.restore();
      } else if (badgeType === 'fire') {
        ctx.save();
        ctx.font = '34px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔥', badgeCenterX, badgeCenterY);
        ctx.restore();
      }

      // Vertical subtle gold divider
      const dividerX = x + 160;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(229, 169, 60, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.moveTo(dividerX, y + 25);
      ctx.lineTo(dividerX, y + h - 25);
      ctx.stroke();

      textStartX = dividerX + 32;
    }

    // 5. Text Hook Content
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const fontSerif = "'DM Serif Display', Georgia, serif";
    const line1 = card.line1 !== undefined ? card.line1 : 'At just 4 years old,';
    const line2 = card.line2 !== undefined ? card.line2 : 'he was already';
    const line2Hl = card.line2Highlight !== undefined ? card.line2Highlight : 'impersonating';
    const line3Hl = card.line3Highlight !== undefined ? card.line3Highlight : 'Elvis...';

    // Calculate Y offsets based on height and number of lines
    const lineSpacing = h < 160 ? 38 : 46;
    const startY = y + (h - (line3Hl ? lineSpacing * 2.2 : lineSpacing * 1.2)) / 2 + 28;

    // Line 1 (White Context)
    if (line1) {
      ctx.font = `700 36px ${fontSerif}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line1, textStartX, startY);
    }

    // Line 2 (White lead + Gold highlight)
    const line2Y = startY + lineSpacing;
    if (line2 || line2Hl) {
      ctx.font = `700 36px ${fontSerif}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line2 ? line2 + ' ' : '', textStartX, line2Y);

      if (line2Hl) {
        const leadWidth = line2 ? ctx.measureText(line2 + ' ').width : 0;
        ctx.fillStyle = '#e5a93c'; // rich vibrant gold
        ctx.fillText(line2Hl, textStartX + leadWidth, line2Y);
      }
    }

    // Line 3 Climax (Big Gold Highlight)
    if (line3Hl) {
      const line3Y = line2Y + lineSpacing + 2;
      ctx.font = `700 40px ${fontSerif}`;
      ctx.fillStyle = '#e5a93c';
      ctx.fillText(line3Hl, textStartX, line3Y);
    }

    // 6. Footer CTA below card (e.g. — Read the full story in caption → —)
    if (card.ctaText) {
      const ctaY = y + h + 42;
      const centerX = x + w / 2;
      ctx.font = "500 22px 'Montserrat', sans-serif";
      ctx.fillStyle = '#2d2d2d';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(card.ctaText, centerX, ctaY);

      // Fine horizontal accent lines left and right of CTA
      const textMetrics = ctx.measureText(card.ctaText);
      const halfTextW = textMetrics.width / 2;
      const ruleOffset = 24;
      const ruleLength = 120;

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.lineWidth = 1;

      // Left rule
      ctx.beginPath();
      ctx.moveTo(centerX - halfTextW - ruleOffset - ruleLength, ctaY);
      ctx.lineTo(centerX - halfTextW - ruleOffset, ctaY);
      ctx.stroke();

      // Right rule
      ctx.beginPath();
      ctx.moveTo(centerX + halfTextW + ruleOffset, ctaY);
      ctx.lineTo(centerX + halfTextW + ruleOffset + ruleLength, ctaY);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawTextLayer(t) {
    ctx.save();
    let weight = t.fontWeight || 600;
    const fam = t.fontFamily || "'Cinzel', serif";
    const famLower = fam.toLowerCase();
    if (famLower.includes('great vibes') || famLower.includes('alex brush') || famLower.includes('sacramento') || famLower.includes('allura') || famLower.includes('ballet')) {
      weight = 400;
    }
    ctx.font = `${weight} ${t.fontSize}px ${fam}`;
    ctx.fillStyle = t.color;
    ctx.textAlign = t.align || 'center';
    ctx.textBaseline = 'middle';

    // Letter spacing
    if (t.letterSpacing && ctx.letterSpacing !== undefined) {
      ctx.letterSpacing = `${t.letterSpacing}px`;
    }

    // Glow / Drop Shadow
    if (t.glow > 0) {
      ctx.shadowColor = t.color === '#111111' ? 'rgba(255,255,255,0.4)' : 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = t.glow;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 3;
    }

    // Calligraphy Extra Thickness (Stroke)
    if (t.strokeWidth && t.strokeWidth > 0) {
      ctx.strokeStyle = t.color;
      ctx.lineWidth = t.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(t.text, t.x, t.y);
    }

    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }

  function drawCoverImage(context, img, x, y, w, h) {
    const imgAspect = img.width / img.height;
    const targetAspect = w / h;
    let sw, sh, sx, sy;

    if (imgAspect > targetAspect) {
      sh = img.height;
      sw = sh * targetAspect;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = sw / targetAspect;
      sx = 0;
      sy = (img.height - sh) / 2;
    }

    context.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  // --- Viewport Zoom & Fit ---
  function setZoom(newZoom) {
    state.zoom = Math.max(0.2, Math.min(2.0, newZoom));
    document.getElementById('zoomPercent').textContent = `${Math.round(state.zoom * 100)}%`;
    canvasWrapper.style.transform = `scale(${state.zoom})`;
    updateSelectionOverlay();
  }

  function fitScreen() {
    const containerW = canvasScrollContainer.clientWidth - 80;
    const containerH = canvasScrollContainer.clientHeight - 80;
    const scaleX = containerW / canvas.width;
    const scaleY = containerH / canvas.height;
    const autoScale = Math.min(scaleX, scaleY, 0.85);
    setZoom(autoScale);
  }

  // --- Selection Overlay Box & Handles ---
  function updateSelectionOverlay() {
    const selectedFrame = state.frames.find(f => f.id === state.selectedFrameId);
    const selectedText = state.textLayers.find(t => t.id === state.selectedTextId);
    const selectedSticker = state.stickers.find(s => s.id === state.selectedStickerId);
    const rotHandle = selectionOverlay.querySelector('.rotate-handle');

    if (selectedSticker) {
      selectionOverlay.style.display = 'block';
      selectionOverlay.style.left = `${selectedSticker.x - selectedSticker.width / 2}px`;
      selectionOverlay.style.top = `${selectedSticker.y - selectedSticker.height / 2}px`;
      selectionOverlay.style.width = `${selectedSticker.width}px`;
      selectionOverlay.style.height = `${selectedSticker.height}px`;
      selectionOverlay.style.border = '2px solid #d4af37';
      selectionOverlay.style.transform = `rotate(${selectedSticker.rotation || 0}deg)`;
      selectionOverlay.style.transformOrigin = 'center center';
      if (rotHandle) rotHandle.style.display = 'block';
    } else if (selectedFrame) {
      selectionOverlay.style.display = 'block';
      selectionOverlay.style.left = `${selectedFrame.x}px`;
      selectionOverlay.style.top = `${selectedFrame.y}px`;
      selectionOverlay.style.width = `${selectedFrame.width}px`;
      selectionOverlay.style.height = `${selectedFrame.height}px`;
      selectionOverlay.style.border = selectedFrame.shape === 'diamond' ? '2px dashed #d4af37' : '2px solid #d4af37';
      const rot = selectedFrame.rotation || 0;
      selectionOverlay.style.transform = rot !== 0 ? `rotate(${rot}deg)` : 'none';
      selectionOverlay.style.transformOrigin = 'center center';
      if (rotHandle) rotHandle.style.display = 'block';
    } else if (selectedText) {
      // Estimate text bounding box
      ctx.font = `${selectedText.fontSize}px ${selectedText.fontFamily}`;
      const metrics = ctx.measureText(selectedText.text);
      const textW = metrics.width + 30;
      const textH = selectedText.fontSize * 1.3;

      selectionOverlay.style.display = 'block';
      selectionOverlay.style.left = `${selectedText.x - textW / 2}px`;
      selectionOverlay.style.top = `${selectedText.y - textH / 2}px`;
      selectionOverlay.style.width = `${textW}px`;
      selectionOverlay.style.height = `${textH}px`;
      selectionOverlay.style.border = '1px dashed #d4af37';
      selectionOverlay.style.transform = 'none';
      if (rotHandle) rotHandle.style.display = 'none';
    } else {
      selectionOverlay.style.display = 'none';
      selectionOverlay.style.transform = 'none';
    }
  }

  // --- Hit Testing (Canvas Clicks) ---
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    const x = (clientX - rect.left) / state.zoom;
    const y = (clientY - rect.top) / state.zoom;
    return { x, y };
  }

  function hitTest(x, y) {
    // 1. Check stickers first (topmost floating elements)
    for (let i = state.stickers.length - 1; i >= 0; i--) {
      const s = state.stickers[i];
      const rad = (-(s.rotation || 0) * Math.PI) / 180;
      const dx = x - s.x;
      const dy = y - s.y;
      const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
      if (Math.abs(rx) <= s.width / 2 && Math.abs(ry) <= s.height / 2) {
        return { type: 'sticker', item: s };
      }
    }

    // 2. Check text layers (middle priority)
    for (let i = state.textLayers.length - 1; i >= 0; i--) {
      const t = state.textLayers[i];
      ctx.font = `${t.fontSize}px ${t.fontFamily}`;
      const metrics = ctx.measureText(t.text);
      const halfW = (metrics.width + 30) / 2;
      const halfH = (t.fontSize * 1.3) / 2;
      if (x >= t.x - halfW && x <= t.x + halfW && y >= t.y - halfH && y <= t.y + halfH) {
        return { type: 'text', item: t };
      }
    }

    // 2.5 Check Story Teaser Card
    if (state.teaserCard && state.teaserCard.enabled) {
      const tc = state.teaserCard;
      if (x >= tc.x && x <= tc.x + tc.width && y >= tc.y && y <= tc.y + tc.height + 60) {
        return { type: 'teaserCard', item: tc };
      }
    }

    // 3. Check frames in reverse order (topmost first)
    for (let i = state.frames.length - 1; i >= 0; i--) {
      const f = state.frames[i];
      const cx = f.x + f.width / 2;
      const cy = f.y + f.height / 2;
      const rot = f.rotation || 0;
      let testX = x;
      let testY = y;
      if (rot !== 0) {
        const rad = (-rot * Math.PI) / 180;
        const dx = x - cx;
        const dy = y - cy;
        testX = cx + (dx * Math.cos(rad) - dy * Math.sin(rad));
        testY = cy + (dx * Math.sin(rad) + dy * Math.cos(rad));
      }

      if (f.shape === 'diamond') {
        // Diamond point inside check: |testX-cx|/w + |testY-cy|/h <= 0.5
        const normalizedDist = Math.abs(testX - cx) / f.width + Math.abs(testY - cy) / f.height;
        if (normalizedDist <= 0.5) return { type: 'frame', item: f };
      } else if (f.shape === 'oval') {
        // Oval inside check: (testX-cx)^2/(w/2)^2 + (testY-cy)^2/(h/2)^2 <= 1
        const rx = f.width / 2;
        const ry = f.height / 2;
        if (Math.pow(testX - cx, 2) / Math.pow(rx, 2) + Math.pow(testY - cy, 2) / Math.pow(ry, 2) <= 1) {
          return { type: 'frame', item: f };
        }
      } else {
        // Standard rectangle check
        if (testX >= f.x && testX <= f.x + f.width && testY >= f.y && testY <= f.y + f.height) {
          return { type: 'frame', item: f };
        }
      }
    }

    return null;
  }

  // --- Synchronize Sidebar UI with Selected Item ---
  function updateUI() {
    frameCountBadge.textContent = state.frames.length;

    // 1. Populate Frames List Tab
    framesListEl.innerHTML = '';
    state.frames.forEach((f, idx) => {
      const item = document.createElement('div');
      item.className = `layer-item ${f.id === state.selectedFrameId ? 'active' : ''}`;
      
      const thumbContent = f.imgElement ? `<img src="${f.imgElement.src}" class="layer-thumb" />` : `<div class="layer-thumb">#${idx + 1}</div>`;

      item.innerHTML = `
        ${thumbContent}
        <div class="layer-info">
          <strong>${f.label || `Frame ${idx + 1}`}</strong>
          <span>Shape: ${f.shape.replace('_', ' ')} • Border: ${f.borderWidth}px</span>
        </div>
      `;
      item.onclick = () => selectFrame(f.id);
      framesListEl.appendChild(item);
    });

    // 2. Frame Editor Tab Sync
    const selFrame = state.frames.find(f => f.id === state.selectedFrameId);
    if (selFrame) {
      frameEditorControls.style.display = 'block';
      noFrameSelectedHint.style.display = 'none';

      // Shape buttons
      document.querySelectorAll('.shape-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.shape === selFrame.shape);
      });

      // Dimensions (Width & Length/Height) sliders
      const fWidthSlider = document.getElementById('frameWidthSlider');
      if (fWidthSlider) {
        fWidthSlider.value = selFrame.width;
        document.getElementById('frameWidthVal').textContent = `${selFrame.width}px`;
      }
      const fHeightSlider = document.getElementById('frameHeightSlider');
      if (fHeightSlider) {
        fHeightSlider.value = selFrame.height;
        document.getElementById('frameHeightVal').textContent = `${selFrame.height}px`;
      }

      // Frame Rotation slider
      const fRotSlider = document.getElementById('frameRotSlider');
      if (fRotSlider) {
        const rot = selFrame.rotation || 0;
        fRotSlider.value = rot;
        const valEl = document.getElementById('frameRotVal');
        if (valEl) valEl.textContent = `${rot}°`;
      }

      // Border & Image sliders
      document.getElementById('borderWidthSlider').value = selFrame.borderWidth;
      document.getElementById('borderWidthVal').textContent = `${selFrame.borderWidth}px`;
      document.getElementById('borderColorPicker').value = selFrame.borderColor || '#d4af37';
      document.getElementById('cornerRadiusSlider').value = selFrame.cornerRadius || 0;
      document.getElementById('shadowSlider').value = selFrame.shadowBlur || 0;

      document.getElementById('imgZoomSlider').value = selFrame.imgScale || 1;
      document.getElementById('imgZoomVal').textContent = `${(selFrame.imgScale || 1).toFixed(2)}x`;
      document.getElementById('imgPanXSlider').value = selFrame.imgPanX || 0;
      document.getElementById('imgPanYSlider').value = selFrame.imgPanY || 0;
    } else {
      frameEditorControls.style.display = 'none';
      noFrameSelectedHint.style.display = 'block';
    }

    // 3. Text Editor Tab Sync
    const selText = state.textLayers.find(t => t.id === state.selectedTextId);
    if (selText) {
      textEditorControls.style.display = 'block';
      noTextSelectedHint.style.display = 'none';

      document.getElementById('textContentInput').value = selText.text;
      document.getElementById('fontFamilySelect').value = selText.fontFamily;
      document.getElementById('fontSizeSlider').value = selText.fontSize;
      document.getElementById('fontSizeVal').textContent = `${selText.fontSize}px`;

      const fwSlider = document.getElementById('fontWeightSlider');
      if (fwSlider) {
        const w = selText.fontWeight || 600;
        fwSlider.value = w;
        const fwVal = document.getElementById('fontWeightVal');
        if (fwVal) {
          let label = `${w}`;
          if (w <= 400) label = `Regular (${w})`;
          else if (w <= 600) label = `Semi-Bold (${w})`;
          else if (w <= 700) label = `Bold (${w})`;
          else label = `Heavy (${w})`;
          fwVal.textContent = label;
        }
      }

      const strSlider = document.getElementById('textStrokeSlider');
      if (strSlider) {
        strSlider.value = selText.strokeWidth || 0;
        const strVal = document.getElementById('textStrokeVal');
        if (strVal) strVal.textContent = `${selText.strokeWidth || 0}px`;
      }

      document.getElementById('textColorPicker').value = selText.color;
      document.getElementById('textGlowSlider').value = selText.glow;
      document.getElementById('letterSpacingSlider').value = selText.letterSpacing || 0;
    } else {
      textEditorControls.style.display = 'none';
      noTextSelectedHint.style.display = 'block';
    }

    // 4. Sticker Editor Tab Sync
    const selSticker = state.stickers.find(s => s.id === state.selectedStickerId);
    const stickerEditorControls = document.getElementById('stickerEditorControls');
    const noStickerSelectedHint = document.getElementById('noStickerSelectedHint');
    if (selSticker) {
      if (stickerEditorControls) stickerEditorControls.style.display = 'block';
      if (noStickerSelectedHint) noStickerSelectedHint.style.display = 'none';

      document.getElementById('stickerRotSlider').value = selSticker.rotation || 0;
      document.getElementById('stickerRotVal').textContent = `${selSticker.rotation || 0}°`;
      document.getElementById('stickerSizeSlider').value = selSticker.width || 120;
      document.getElementById('stickerSizeVal').textContent = `${selSticker.width || 120}px`;
      document.getElementById('stickerOpacitySlider').value = selSticker.opacity !== undefined ? selSticker.opacity : 1;
      document.getElementById('stickerOpacityVal').textContent = `${Math.round((selSticker.opacity !== undefined ? selSticker.opacity : 1) * 100)}%`;
      document.getElementById('stickerShadowSlider').value = selSticker.shadowBlur || 0;
    } else {
      if (stickerEditorControls) stickerEditorControls.style.display = 'none';
      if (noStickerSelectedHint) noStickerSelectedHint.style.display = 'block';
    }

    // 5. Teaser Card Tab Sync
    if (state.teaserCard) {
      const tc = state.teaserCard;
      const toggle = document.getElementById('teaserCardEnabledToggle');
      if (toggle) toggle.checked = tc.enabled !== false;
      const l1 = document.getElementById('teaserLine1Input');
      if (l1) l1.value = tc.line1 || '';
      const l2 = document.getElementById('teaserLine2Input');
      if (l2) l2.value = tc.line2 || '';
      const l2hl = document.getElementById('teaserLine2HighlightInput');
      if (l2hl) l2hl.value = tc.line2Highlight || '';
      const l3hl = document.getElementById('teaserLine3HighlightInput');
      if (l3hl) l3hl.value = tc.line3Highlight || '';
      const cta = document.getElementById('teaserCtaInput');
      if (cta) cta.value = tc.ctaText || '';
      const yS = document.getElementById('teaserYSlider');
      if (yS) {
        yS.value = tc.y || 1010;
        const yV = document.getElementById('teaserYVal');
        if (yV) yV.textContent = `${tc.y || 1010}px`;
      }
      const hS = document.getElementById('teaserHeightSlider');
      if (hS) {
        hS.value = tc.height || 185;
        const hV = document.getElementById('teaserHeightVal');
        if (hV) hV.textContent = `${tc.height || 185}px`;
      }
      document.querySelectorAll('.badge-icon-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.icon === (tc.badgeIcon || 'crown'));
      });
    }
  }

  function selectFrame(id) {
    state.selectedFrameId = id;
    state.selectedTextId = null;
    state.selectedStickerId = null;
    updateUI();
    renderCanvas();
    const styleTab = document.querySelector('[data-tab="tab-style"]');
    if (styleTab) styleTab.click();
  }

  function selectText(id) {
    state.selectedTextId = id;
    state.selectedFrameId = null;
    state.selectedStickerId = null;
    updateUI();
    renderCanvas();
    const textTab = document.querySelector('[data-tab="tab-text"]');
    if (textTab) textTab.click();
  }

  function selectSticker(id) {
    state.selectedStickerId = id;
    state.selectedFrameId = null;
    state.selectedTextId = null;
    updateUI();
    renderCanvas();
    const stickerTab = document.querySelector('[data-tab="tab-stickers"]');
    if (stickerTab) stickerTab.click();
  }

  function deselectAll() {
    state.selectedFrameId = null;
    state.selectedTextId = null;
    state.selectedStickerId = null;
    updateUI();
    renderCanvas();
  }

  // --- Mouse / Pointer Dragging & Resizing ---
  canvas.addEventListener('mousedown', e => {
    const coords = getCanvasCoords(e);
    const hit = hitTest(coords.x, coords.y);

    if (hit) {
      if (hit.type === 'sticker') {
        selectSticker(hit.item.id);
        state.dragTarget = {
          type: 'sticker',
          id: hit.item.id,
          startX: coords.x,
          startY: coords.y,
          origX: hit.item.x,
          origY: hit.item.y,
          origW: hit.item.width,
          origH: hit.item.height
        };
      } else if (hit.type === 'frame') {
        selectFrame(hit.item.id);
        state.dragTarget = {
          type: 'frame',
          id: hit.item.id,
          startX: coords.x,
          startY: coords.y,
          origX: hit.item.x,
          origY: hit.item.y,
          origW: hit.item.width,
          origH: hit.item.height
        };
      } else if (hit.type === 'text') {
        selectText(hit.item.id);
        state.dragTarget = {
          type: 'text',
          id: hit.item.id,
          startX: coords.x,
          startY: coords.y,
          origX: hit.item.x,
          origY: hit.item.y
        };
      } else if (hit.type === 'teaserCard') {
        const teaserTabBtn = document.querySelector('[data-tab="tab-teaser"]');
        if (teaserTabBtn) teaserTabBtn.click();
        state.selectedFrameId = null;
        state.selectedTextId = null;
        state.selectedStickerId = null;
        updateUI();
        state.dragTarget = {
          type: 'teaserCard',
          startX: coords.x,
          startY: coords.y,
          origX: hit.item.x,
          origY: hit.item.y
        };
      }
      state.isDragging = true;
    } else {
      deselectAll();
    }
  });

  window.addEventListener('mousemove', e => {
    if (!state.isDragging || !state.dragTarget) return;

    const coords = getCanvasCoords(e);
    const dx = coords.x - state.dragTarget.startX;
    const dy = coords.y - state.dragTarget.startY;

    if (state.dragTarget.type === 'sticker') {
      const sticker = state.stickers.find(s => s.id === state.dragTarget.id);
      if (sticker) {
        sticker.x = Math.round(state.dragTarget.origX + dx);
        sticker.y = Math.round(state.dragTarget.origY + dy);
        renderCanvas();
      }
    } else if (state.dragTarget.type === 'frame') {
      const frame = state.frames.find(f => f.id === state.dragTarget.id);
      if (frame) {
        frame.x = Math.round(state.dragTarget.origX + dx);
        frame.y = Math.round(state.dragTarget.origY + dy);
        renderCanvas();
      }
    } else if (state.dragTarget.type === 'text') {
      const text = state.textLayers.find(t => t.id === state.dragTarget.id);
      if (text) {
        text.x = Math.round(state.dragTarget.origX + dx);
        text.y = Math.round(state.dragTarget.origY + dy);
        renderCanvas();
      }
    } else if (state.dragTarget.type === 'teaserCard') {
      if (state.teaserCard) {
        state.teaserCard.y = Math.round(state.dragTarget.origY + dy);
        const ySlider = document.getElementById('teaserYSlider');
        const yVal = document.getElementById('teaserYVal');
        if (ySlider) ySlider.value = state.teaserCard.y;
        if (yVal) yVal.textContent = `${state.teaserCard.y}px`;
        renderCanvas();
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (state.isDragging) {
      state.isDragging = false;
      state.dragTarget = null;
      pushState();
    }
  });

  // Resize Handle Interactions
  document.querySelectorAll('.handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.stopPropagation();
      const selFrame = state.frames.find(f => f.id === state.selectedFrameId);
      const selSticker = state.stickers.find(s => s.id === state.selectedStickerId);
      if (!selFrame && !selSticker) return;

      const handleType = handle.dataset.handle;
      const coords = getCanvasCoords(e);

      state.isResizing = true;
      state.activeHandle = handleType;

      if (selSticker) {
        state.dragTarget = {
          type: 'resize_sticker',
          id: selSticker.id,
          startX: coords.x,
          startY: coords.y,
          origX: selSticker.x,
          origY: selSticker.y,
          origW: selSticker.width,
          origH: selSticker.height,
          handle: handleType
        };
      } else {
        state.dragTarget = {
          type: 'resize_frame',
          id: selFrame.id,
          startX: coords.x,
          startY: coords.y,
          origX: selFrame.x,
          origY: selFrame.y,
          origW: selFrame.width,
          origH: selFrame.height,
          handle: handleType
        };
      }

      const onResizeMove = moveEvent => {
        if (!state.isResizing || !state.dragTarget) return;
        const curCoords = getCanvasCoords(moveEvent);
        const rdx = curCoords.x - state.dragTarget.startX;
        const rdy = curCoords.y - state.dragTarget.startY;

        if (state.dragTarget.type === 'resize_sticker') {
          const sticker = state.stickers.find(s => s.id === state.dragTarget.id);
          if (sticker) {
            let delta = Math.max(rdx, rdy);
            if (state.dragTarget.handle.includes('w') || state.dragTarget.handle.includes('n')) delta = -delta;
            const newDim = Math.max(30, Math.min(500, Math.round(state.dragTarget.origW + delta)));
            sticker.width = newDim;
            sticker.height = newDim;
            const sizeSlider = document.getElementById('stickerSizeSlider');
            if (sizeSlider) sizeSlider.value = newDim;
            const sizeVal = document.getElementById('stickerSizeVal');
            if (sizeVal) sizeVal.textContent = `${newDim}px`;
            renderCanvas();
          }
          return;
        }

        const frame = state.frames.find(f => f.id === state.dragTarget.id);
        if (!frame) return;

        const h = state.dragTarget.handle;
        let newX = state.dragTarget.origX;
        let newY = state.dragTarget.origY;
        let newW = state.dragTarget.origW;
        let newH = state.dragTarget.origH;

        if (h.includes('e')) newW = Math.max(80, state.dragTarget.origW + rdx);
        if (h.includes('s')) newH = Math.max(80, state.dragTarget.origH + rdy);
        if (h.includes('w')) {
          const delta = state.dragTarget.origW - rdx;
          if (delta > 80) {
            newW = delta;
            newX = state.dragTarget.origX + rdx;
          }
        }
        if (h.includes('n')) {
          const delta = state.dragTarget.origH - rdy;
          if (delta > 80) {
            newH = delta;
            newY = state.dragTarget.origY + rdy;
          }
        }

        frame.x = Math.round(newX);
        frame.y = Math.round(newY);
        frame.width = Math.round(newW);
        frame.height = Math.round(newH);

        const fWidthSlider = document.getElementById('frameWidthSlider');
        if (fWidthSlider) {
          fWidthSlider.value = frame.width;
          const valEl = document.getElementById('frameWidthVal');
          if (valEl) valEl.textContent = `${frame.width}px`;
        }
        const fHeightSlider = document.getElementById('frameHeightSlider');
        if (fHeightSlider) {
          fHeightSlider.value = frame.height;
          const valEl = document.getElementById('frameHeightVal');
          if (valEl) valEl.textContent = `${frame.height}px`;
        }

        renderCanvas();
      };

      const onResizeUp = () => {
        state.isResizing = false;
        state.dragTarget = null;
        pushState();
        window.removeEventListener('mousemove', onResizeMove);
        window.removeEventListener('mouseup', onResizeUp);
      };

      window.addEventListener('mousemove', onResizeMove);
      window.addEventListener('mouseup', onResizeUp);
    });
  });

  // Dedicated Rotation Handle Drag Listener
  const rotHandleEl = document.querySelector('.rotate-handle');
  if (rotHandleEl) {
    rotHandleEl.addEventListener('mousedown', e => {
      e.stopPropagation();
      const selSticker = state.stickers.find(s => s.id === state.selectedStickerId);
      const selFrame = state.frames.find(f => f.id === state.selectedFrameId);
      if (!selSticker && !selFrame) return;

      state.isRotating = true;

      const onRotateMove = moveEvent => {
        if (!state.isRotating) return;
        const coords = getCanvasCoords(moveEvent);

        if (selSticker) {
          const angleRad = Math.atan2(coords.y - selSticker.y, coords.x - selSticker.x);
          let deg = Math.round((angleRad * 180) / Math.PI) + 90;
          while (deg > 180) deg -= 360;
          while (deg < -180) deg += 360;
          selSticker.rotation = deg;
          const rotSlider = document.getElementById('stickerRotSlider');
          if (rotSlider) rotSlider.value = deg;
          const rotVal = document.getElementById('stickerRotVal');
          if (rotVal) rotVal.textContent = `${deg}°`;
        } else if (selFrame) {
          const cx = selFrame.x + selFrame.width / 2;
          const cy = selFrame.y + selFrame.height / 2;
          const angleRad = Math.atan2(coords.y - cy, coords.x - cx);
          let deg = Math.round((angleRad * 180) / Math.PI) + 90;
          while (deg > 180) deg -= 360;
          while (deg < -180) deg += 360;
          selFrame.rotation = deg;
          const rotSlider = document.getElementById('frameRotSlider');
          if (rotSlider) rotSlider.value = deg;
          const rotVal = document.getElementById('frameRotVal');
          if (rotVal) rotVal.textContent = `${deg}°`;
        }

        updateSelectionOverlay();
        renderCanvas();
      };

      const onRotateUp = () => {
        state.isRotating = false;
        pushState();
        window.removeEventListener('mousemove', onRotateMove);
        window.removeEventListener('mouseup', onRotateUp);
      };

      window.addEventListener('mousemove', onRotateMove);
      window.addEventListener('mouseup', onRotateUp);
    });
  }

  // --- Drag and Drop Photos directly onto Canvas ---
  canvas.addEventListener('dragover', e => e.preventDefault());
  canvas.addEventListener('drop', e => {
    e.preventDefault();
    const coords = getCanvasCoords(e);
    const hit = hitTest(coords.x, coords.y);
    const files = e.dataTransfer.files;

    if (files && files[0] && files[0].type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          if (hit && hit.type === 'frame') {
            hit.item.imgElement = img;
            selectFrame(hit.item.id);
            showToast(`Photo dropped into ${hit.item.label}`);
          } else {
            // Drop onto canvas as background or new frame
            state.bgCustomImage = img;
            state.bgType = 'custom';
            showToast('Custom Background Image Applied');
          }
          pushState();
          updateUI();
          renderCanvas();
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(files[0]);
    }
  });

  // --- Photo Upload Handling ---
  document.getElementById('singlePhotoInput').addEventListener('change', e => {
    const file = e.target.files[0];
    const frame = state.frames.find(f => f.id === state.selectedFrameId);
    if (!file || !frame) return;

    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        frame.imgElement = img;
        pushState();
        updateUI();
        renderCanvas();
        showToast('Photo uploaded to frame');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('removePhotoBtn').addEventListener('click', () => {
    const frame = state.frames.find(f => f.id === state.selectedFrameId);
    if (frame) {
      frame.imgElement = null;
      pushState();
      updateUI();
      renderCanvas();
      showToast('Photo cleared');
    }
  });

  // Batch Photo Upload
  document.getElementById('batchUploadInput').addEventListener('change', e => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;

    let fileIdx = 0;
    // Fill empty frames first, then replace
    state.frames.forEach(frame => {
      if (fileIdx < files.length && !frame.imgElement) {
        const reader = new FileReader();
        const curFile = files[fileIdx++];
        reader.onload = ev => {
          const img = new Image();
          img.onload = () => {
            frame.imgElement = img;
            renderCanvas();
            updateUI();
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(curFile);
      }
    });

    pushState();
    showToast(`Batch uploaded ${files.length} photos`);
  });

  // --- Frame Shape & Border Controls ---
  document.querySelectorAll('.shape-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const frame = state.frames.find(f => f.id === state.selectedFrameId);
      if (!frame) return;

      const shape = btn.dataset.shape;
      frame.shape = shape;

      if (shape === 'white_rect') {
        frame.borderColor = '#ffffff';
        frame.borderWidth = 10;
      } else if (shape === 'gold_rect') {
        frame.borderColor = '#d4af37';
        frame.borderWidth = 8;
      } else if (shape === 'diamond') {
        frame.borderColor = '#d4af37';
        frame.borderWidth = 12;
      } else if (shape === 'oval') {
        frame.borderColor = '#ffffff';
        frame.borderWidth = 10;
      }

      pushState();
      updateUI();
      renderCanvas();
      showToast(`Shape changed to ${shape}`);
    });
  });

  // Frame Width & Length (Height) Sliders
  const frameWidthSlider = document.getElementById('frameWidthSlider');
  if (frameWidthSlider) {
    frameWidthSlider.addEventListener('input', e => {
      const frame = state.frames.find(f => f.id === state.selectedFrameId);
      if (!frame) return;
      frame.width = parseInt(e.target.value, 10);
      document.getElementById('frameWidthVal').textContent = `${frame.width}px`;
      updateSelectionOverlay();
      renderCanvas();
    });
    frameWidthSlider.addEventListener('change', pushState);
  }

  const frameHeightSlider = document.getElementById('frameHeightSlider');
  if (frameHeightSlider) {
    frameHeightSlider.addEventListener('input', e => {
      const frame = state.frames.find(f => f.id === state.selectedFrameId);
      if (!frame) return;
      frame.height = parseInt(e.target.value, 10);
      document.getElementById('frameHeightVal').textContent = `${frame.height}px`;
      updateSelectionOverlay();
      renderCanvas();
    });
    frameHeightSlider.addEventListener('change', pushState);
  }

  // Quick proportion buttons for diamond, oval, and boxes
  const sizeSquareBtn = document.getElementById('sizeSquareBtn');
  if (sizeSquareBtn) {
    sizeSquareBtn.addEventListener('click', () => {
      const frame = state.frames.find(f => f.id === state.selectedFrameId);
      if (!frame) return;
      const dim = Math.max(frame.width, frame.height);
      frame.width = dim;
      frame.height = dim;
      updateUI();
      updateSelectionOverlay();
      renderCanvas();
      pushState();
      showToast('Set to 1:1 Square Diamond');
    });
  }

  const sizeTallBtn = document.getElementById('sizeTallBtn');
  if (sizeTallBtn) {
    sizeTallBtn.addEventListener('click', () => {
      const frame = state.frames.find(f => f.id === state.selectedFrameId);
      if (!frame) return;
      frame.height = Math.round(frame.width * 1.35);
      updateUI();
      updateSelectionOverlay();
      renderCanvas();
      pushState();
      showToast('Set to Tall Diamond (Length > Width)');
    });
  }

  const sizeWideBtn = document.getElementById('sizeWideBtn');
  if (sizeWideBtn) {
    sizeWideBtn.addEventListener('click', () => {
      const frame = state.frames.find(f => f.id === state.selectedFrameId);
      if (!frame) return;
      frame.width = Math.round(frame.height * 1.35);
      updateUI();
      updateSelectionOverlay();
      renderCanvas();
      pushState();
      showToast('Set to Wide Diamond (Width > Length)');
    });
  }

  // Frame Rotation Slider & Quick Angle Presets
  const frameRotSlider = document.getElementById('frameRotSlider');
  if (frameRotSlider) {
    frameRotSlider.addEventListener('input', e => {
      const frame = state.frames.find(f => f.id === state.selectedFrameId);
      if (!frame) return;
      frame.rotation = parseInt(e.target.value, 10);
      const valEl = document.getElementById('frameRotVal');
      if (valEl) valEl.textContent = `${frame.rotation}°`;
      updateSelectionOverlay();
      renderCanvas();
    });
    frameRotSlider.addEventListener('change', pushState);
  }

  function setFrameRotation(deg) {
    const frame = state.frames.find(f => f.id === state.selectedFrameId);
    if (!frame) return;
    let normalized = deg;
    while (normalized > 180) normalized -= 360;
    while (normalized < -180) normalized += 360;
    frame.rotation = normalized;
    const slider = document.getElementById('frameRotSlider');
    if (slider) slider.value = normalized;
    const valEl = document.getElementById('frameRotVal');
    if (valEl) valEl.textContent = `${normalized}°`;
    pushState();
    updateSelectionOverlay();
    renderCanvas();
  }

  const btnRotReset = document.getElementById('rotResetBtn');
  if (btnRotReset) btnRotReset.addEventListener('click', () => { setFrameRotation(0); showToast('Rotation reset to 0°'); });
  const btnRot45 = document.getElementById('rot45Btn');
  if (btnRot45) btnRot45.addEventListener('click', () => { setFrameRotation(45); showToast('Rotated +45°'); });
  const btnRot90 = document.getElementById('rot90Btn');
  if (btnRot90) btnRot90.addEventListener('click', () => { setFrameRotation(90); showToast('Rotated +90°'); });
  const btnRotMinus45 = document.getElementById('rotMinus45Btn');
  if (btnRotMinus45) btnRotMinus45.addEventListener('click', () => { setFrameRotation(-45); showToast('Rotated -45°'); });
  const btnRotMinus90 = document.getElementById('rotMinus90Btn');
  if (btnRotMinus90) btnRotMinus90.addEventListener('click', () => { setFrameRotation(-90); showToast('Rotated -90°'); });
  const btnRot180 = document.getElementById('rot180Btn');
  if (btnRot180) btnRot180.addEventListener('click', () => { setFrameRotation(180); showToast('Rotated 180°'); });
  const btnRotNudgeLeft = document.getElementById('rotNudgeLeftBtn');
  if (btnRotNudgeLeft) btnRotNudgeLeft.addEventListener('click', () => {
    const frame = state.frames.find(f => f.id === state.selectedFrameId);
    if (frame) setFrameRotation((frame.rotation || 0) - 5);
  });
  const btnRotNudgeRight = document.getElementById('rotNudgeRightBtn');
  if (btnRotNudgeRight) btnRotNudgeRight.addEventListener('click', () => {
    const frame = state.frames.find(f => f.id === state.selectedFrameId);
    if (frame) setFrameRotation((frame.rotation || 0) + 5);
  });

  // Sliders
  document.getElementById('borderWidthSlider').addEventListener('input', e => {
    const frame = state.frames.find(f => f.id === state.selectedFrameId);
    if (!frame) return;
    frame.borderWidth = parseInt(e.target.value, 10);
    document.getElementById('borderWidthVal').textContent = `${frame.borderWidth}px`;
    renderCanvas();
  });
  document.getElementById('borderWidthSlider').addEventListener('change', pushState);

  document.getElementById('cornerRadiusSlider').addEventListener('input', e => {
    const frame = state.frames.find(f => f.id === state.selectedFrameId);
    if (!frame) return;
    frame.cornerRadius = parseInt(e.target.value, 10);
    renderCanvas();
  });
  document.getElementById('cornerRadiusSlider').addEventListener('change', pushState);

  document.getElementById('shadowSlider').addEventListener('input', e => {
    const frame = state.frames.find(f => f.id === state.selectedFrameId);
    if (!frame) return;
    frame.shadowBlur = parseInt(e.target.value, 10);
    renderCanvas();
  });
  document.getElementById('shadowSlider').addEventListener('change', pushState);

  document.getElementById('imgZoomSlider').addEventListener('input', e => {
    const frame = state.frames.find(f => f.id === state.selectedFrameId);
    if (!frame) return;
    frame.imgScale = parseFloat(e.target.value);
    document.getElementById('imgZoomVal').textContent = `${frame.imgScale.toFixed(2)}x`;
    renderCanvas();
  });
  document.getElementById('imgZoomSlider').addEventListener('change', pushState);

  document.getElementById('imgPanXSlider').addEventListener('input', e => {
    const frame = state.frames.find(f => f.id === state.selectedFrameId);
    if (!frame) return;
    frame.imgPanX = parseInt(e.target.value, 10);
    renderCanvas();
  });
  document.getElementById('imgPanXSlider').addEventListener('change', pushState);

  document.getElementById('imgPanYSlider').addEventListener('input', e => {
    const frame = state.frames.find(f => f.id === state.selectedFrameId);
    if (!frame) return;
    frame.imgPanY = parseInt(e.target.value, 10);
    renderCanvas();
  });
  document.getElementById('imgPanYSlider').addEventListener('change', pushState);

  // Border Color Swatches
  document.querySelectorAll('#tab-style .swatch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const frame = state.frames.find(f => f.id === state.selectedFrameId);
      if (!frame) return;
      frame.borderColor = btn.dataset.color;
      document.getElementById('borderColorPicker').value = frame.borderColor;
      pushState();
      renderCanvas();
    });
  });

  document.getElementById('borderColorPicker').addEventListener('input', e => {
    const frame = state.frames.find(f => f.id === state.selectedFrameId);
    if (!frame) return;
    frame.borderColor = e.target.value;
    renderCanvas();
  });
  document.getElementById('borderColorPicker').addEventListener('change', pushState);

  // Layer Ordering Buttons
  document.getElementById('bringForwardBtn').addEventListener('click', () => {
    const idx = state.frames.findIndex(f => f.id === state.selectedFrameId);
    if (idx < state.frames.length - 1) {
      const item = state.frames.splice(idx, 1)[0];
      state.frames.splice(idx + 1, 0, item);
      pushState();
      updateUI();
      renderCanvas();
    }
  });

  document.getElementById('sendBackwardBtn').addEventListener('click', () => {
    const idx = state.frames.findIndex(f => f.id === state.selectedFrameId);
    if (idx > 0) {
      const item = state.frames.splice(idx, 1)[0];
      state.frames.splice(idx - 1, 0, item);
      pushState();
      updateUI();
      renderCanvas();
    }
  });

  document.getElementById('bringToFrontBtn').addEventListener('click', () => {
    const idx = state.frames.findIndex(f => f.id === state.selectedFrameId);
    if (idx !== -1) {
      const item = state.frames.splice(idx, 1)[0];
      state.frames.push(item);
      pushState();
      updateUI();
      renderCanvas();
    }
  });

  document.getElementById('sendToBackBtn').addEventListener('click', () => {
    const idx = state.frames.findIndex(f => f.id === state.selectedFrameId);
    if (idx !== -1) {
      const item = state.frames.splice(idx, 1)[0];
      state.frames.unshift(item);
      pushState();
      updateUI();
      renderCanvas();
    }
  });

  document.getElementById('deleteFrameBtn').addEventListener('click', () => {
    state.frames = state.frames.filter(f => f.id !== state.selectedFrameId);
    state.selectedFrameId = null;
    pushState();
    updateUI();
    renderCanvas();
    showToast('Frame deleted');
  });

  // --- Add Elements Buttons ---
  function addNewFrame() {
    const newFrame = {
      id: uid('frame'),
      label: `Frame ${state.frames.length + 1}`,
      x: 100,
      y: 100,
      width: 400,
      height: 400,
      shape: 'gold_rect',
      borderWidth: 6,
      borderColor: '#d4af37',
      cornerRadius: 4,
      shadowBlur: 15,
      imgElement: null,
      imgScale: 1,
      imgPanX: 0,
      imgPanY: 0
    };
    state.frames.push(newFrame);
    selectFrame(newFrame.id);
    pushState();
    updateUI();
    renderCanvas();
    showToast('Added New Photo Frame');
  }

  document.getElementById('addNewFrameBtn').addEventListener('click', addNewFrame);
  document.getElementById('addFrameQuickBtn').addEventListener('click', addNewFrame);

  // --- Typography & Text Layer Controls ---
  function addNewText(defaultText = 'Celebrity Name', font = "'Great Vibes', cursive", size = 64) {
    const newText = {
      id: uid('text'),
      text: defaultText,
      fontFamily: font,
      fontSize: size,
      color: '#f7e7b4',
      x: state.canvasWidth / 2,
      y: state.canvasHeight / 2,
      align: 'center',
      glow: 14,
      letterSpacing: 1
    };
    state.textLayers.push(newText);
    selectText(newText.id);
    pushState();
    updateUI();
    renderCanvas();
    showToast('Added Text Layer');
  }

  document.getElementById('addNewTextBtn').addEventListener('click', () => addNewText('Celebrity Name'));
  document.getElementById('addTextLayerBtn').addEventListener('click', () => addNewText('Celebrity Name'));

  document.getElementById('addSignaturePresetBtn').addEventListener('click', () => {
    addNewText('Kate Winslet', "'Great Vibes', cursive", 72);
  });

  document.getElementById('addHeaderPresetBtn').addEventListener('click', () => {
    addNewText('RETRO HOLLYWOOD TRIBUTE', "'Cinzel', serif", 34);
  });

  document.getElementById('addYearsPresetBtn').addEventListener('click', () => {
    addNewText('1975 - PRESENT', "'Bodoni Moda', serif", 24);
  });

  document.getElementById('textContentInput').addEventListener('input', e => {
    const text = state.textLayers.find(t => t.id === state.selectedTextId);
    if (!text) return;
    text.text = e.target.value;
    renderCanvas();
  });
  document.getElementById('textContentInput').addEventListener('change', pushState);

  document.getElementById('fontFamilySelect').addEventListener('change', e => {
    const text = state.textLayers.find(t => t.id === state.selectedTextId);
    if (!text) return;
    text.fontFamily = e.target.value;
    pushState();
    renderCanvas();
  });

  document.getElementById('fontSizeSlider').addEventListener('input', e => {
    const text = state.textLayers.find(t => t.id === state.selectedTextId);
    if (!text) return;
    text.fontSize = parseInt(e.target.value, 10);
    document.getElementById('fontSizeVal').textContent = `${text.fontSize}px`;
    renderCanvas();
  });
  document.getElementById('fontSizeSlider').addEventListener('change', pushState);

  const fwSliderInput = document.getElementById('fontWeightSlider');
  if (fwSliderInput) {
    fwSliderInput.addEventListener('input', e => {
      const text = state.textLayers.find(t => t.id === state.selectedTextId);
      if (!text) return;
      const w = parseInt(e.target.value, 10);
      text.fontWeight = w;
      const fwVal = document.getElementById('fontWeightVal');
      if (fwVal) {
        let label = `${w}`;
        if (w <= 400) label = `Regular (${w})`;
        else if (w <= 600) label = `Semi-Bold (${w})`;
        else if (w <= 700) label = `Bold (${w})`;
        else label = `Heavy (${w})`;
        fwVal.textContent = label;
      }
      renderCanvas();
    });
    fwSliderInput.addEventListener('change', pushState);
  }

  const textStrokeInput = document.getElementById('textStrokeSlider');
  if (textStrokeInput) {
    textStrokeInput.addEventListener('input', e => {
      const text = state.textLayers.find(t => t.id === state.selectedTextId);
      if (!text) return;
      text.strokeWidth = parseFloat(e.target.value);
      const strVal = document.getElementById('textStrokeVal');
      if (strVal) strVal.textContent = `${text.strokeWidth}px`;
      renderCanvas();
    });
    textStrokeInput.addEventListener('change', pushState);
  }

  document.getElementById('textGlowSlider').addEventListener('input', e => {
    const text = state.textLayers.find(t => t.id === state.selectedTextId);
    if (!text) return;
    text.glow = parseInt(e.target.value, 10);
    renderCanvas();
  });
  document.getElementById('textGlowSlider').addEventListener('change', pushState);

  document.getElementById('letterSpacingSlider').addEventListener('input', e => {
    const text = state.textLayers.find(t => t.id === state.selectedTextId);
    if (!text) return;
    text.letterSpacing = parseInt(e.target.value, 10);
    renderCanvas();
  });
  document.getElementById('letterSpacingSlider').addEventListener('change', pushState);

  document.querySelectorAll('#tab-text .swatch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = state.textLayers.find(t => t.id === state.selectedTextId);
      if (!text) return;
      text.color = btn.dataset.color;
      document.getElementById('textColorPicker').value = text.color;
      pushState();
      renderCanvas();
    });
  });

  document.getElementById('textColorPicker').addEventListener('input', e => {
    const text = state.textLayers.find(t => t.id === state.selectedTextId);
    if (!text) return;
    text.color = e.target.value;
    renderCanvas();
  });
  document.getElementById('textColorPicker').addEventListener('change', pushState);

  document.getElementById('deleteTextBtn').addEventListener('click', () => {
    state.textLayers = state.textLayers.filter(t => t.id !== state.selectedTextId);
    state.selectedTextId = null;
    pushState();
    updateUI();
    renderCanvas();
    showToast('Text layer removed');
  });

  // =========================================================
  // Stickers, Reaction Badges & Floating Overlays
  // =========================================================
  const STICKER_SVGS = {
    fb_like: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#1877F2"/><path d="M52 24c-2.5 0-4.5 3-4.5 7 0 6-5 11-7 13v26h28c3 0 5-2 6-5l5-16c1-4-2-7-6-7h-12c1-3 2-6 2-9 0-5-4-9-9-9zM32 44h8v26h-8z" fill="#FFFFFF"/></svg>`,
    fb_love: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#FA3E3E"/><path d="M50 74s-24-14.5-24-30c0-8.5 7-15 15.5-15 5 0 9.5 2.5 12 6.5 2.5-4 7-6.5 12-6.5 8.5 0 15.5 6.5 15.5 15 0 15.5-24 30-24 30z" fill="#FFFFFF"/></svg>`,
    fb_care: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#F7B125"/><circle cx="36" cy="42" r="5" fill="#5C3B00"/><circle cx="64" cy="42" r="5" fill="#5C3B00"/><path d="M38 58c3 6 10 9 12 9s9-3 12-9" stroke="#5C3B00" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M50 78s-16-10-16-20c0-6 4.5-10 10-10 3.5 0 6.5 2 8 4.5 1.5-2.5 4.5-4.5 8-4.5 5.5 0 10 4 10 10 0 10-16 20-16 20z" fill="#FA3E3E"/></svg>`,
    crown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="cgold" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFF2A7"/><stop offset="50%" stop-color="#D4AF37"/><stop offset="100%" stop-color="#997A15"/></linearGradient></defs><path d="M15 72l6-42 18 20 11-30 11 30 18-20 6 42z" fill="url(#cgold)"/><rect x="15" y="72" width="70" height="10" rx="3" fill="url(#cgold)"/><circle cx="15" cy="30" r="4" fill="#FFF"/><circle cx="50" cy="20" r="5" fill="#FFF"/><circle cx="85" cy="30" r="4" fill="#FFF"/></svg>`,
    butterfly: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bgold" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFEAA7"/><stop offset="50%" stop-color="#E1B12C"/><stop offset="100%" stop-color="#A77A0E"/></linearGradient></defs><path d="M50 20c-5-12-32-15-40 4-6 15 4 38 40 46-36 8-46 31-40 46 8 19 35 16 40 4z" fill="url(#bgold)"/><path d="M50 20c5-12 32-15 40 4 6 15-4 38-40 46 36 8 46 31 40 46-8 19-35 16-40 4z" fill="url(#bgold)"/><ellipse cx="50" cy="50" rx="3" ry="24" fill="#3D2906"/></svg>`,
    star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 64,36 98,39 72,62 80,95 50,77 20,95 28,62 2,39 36,36" fill="#FFD700" stroke="#D4AF37" stroke-width="2"/></svg>`,
    clapper: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="15" y="38" width="70" height="46" rx="4" fill="#222" stroke="#D4AF37" stroke-width="3"/><path d="M15 24l70-10 2 14-70 10z" fill="#222" stroke="#D4AF37" stroke-width="2"/><line x1="30" y1="22" x2="35" y2="35" stroke="#FFF" stroke-width="3"/><line x1="50" y1="19" x2="55" y2="32" stroke="#FFF" stroke-width="3"/><line x1="70" y1="16" x2="75" y2="29" stroke="#FFF" stroke-width="3"/><text x="50" y="68" fill="#D4AF37" font-size="14" font-family="sans-serif" font-weight="bold" text-anchor="middle">CINEMA</text></svg>`,
    trophy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M42 16h16v18c0 7-5 13-11 14 0 9 6 18 13 22h-20c7-4 13-13 13-22-6-1-11-7-11-14z" fill="#D4AF37"/><circle cx="50" cy="12" r="7" fill="#F7E7B4"/><rect x="34" y="74" width="32" height="14" rx="2" fill="#222" stroke="#D4AF37" stroke-width="2"/></svg>`
  };

  function createStickerFromSvg(svgStr, label, w = 120, h = 120) {
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const newSticker = {
        id: uid('sticker'),
        label: label,
        imgElement: img,
        x: state.canvasWidth / 2,
        y: state.canvasHeight / 2,
        width: w,
        height: h,
        rotation: 0,
        opacity: 1,
        shadowBlur: 14
      };
      state.stickers.push(newSticker);
      selectSticker(newSticker.id);
      pushState();
      updateUI();
      renderCanvas();
      showToast(`Added ${label}`);
    };
    img.src = url;
  }

  function addCustomStickerFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > 220 || h > 220) {
          const scale = 220 / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const newSticker = {
          id: uid('sticker'),
          label: file.name.replace(/\.[^/.]+$/, ""),
          imgElement: img,
          x: state.canvasWidth / 2,
          y: state.canvasHeight / 2,
          width: Math.max(50, w),
          height: Math.max(50, h),
          rotation: 0,
          opacity: 1,
          shadowBlur: 12
        };
        state.stickers.push(newSticker);
        selectSticker(newSticker.id);
        pushState();
        updateUI();
        renderCanvas();
        showToast('Custom Image Added!');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Preset Sticker Buttons
  document.querySelectorAll('.sticker-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.dataset.preset;
      const svg = STICKER_SVGS[presetKey];
      if (svg) {
        createStickerFromSvg(svg, btn.title || 'Badge');
      }
    });
  });

  // Custom Sticker Upload Inputs
  const customStickerInput = document.getElementById('customStickerUploadInput');
  if (customStickerInput) {
    customStickerInput.addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) {
        addCustomStickerFile(e.target.files[0]);
      }
    });
  }

  const directStickerInput = document.getElementById('stickerDirectUpload');
  if (directStickerInput) {
    directStickerInput.addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) {
        addCustomStickerFile(e.target.files[0]);
      }
    });
  }

  // Add Sticker button in Layout tab
  const addNewStickerBtn = document.getElementById('addNewStickerBtn');
  if (addNewStickerBtn) {
    addNewStickerBtn.addEventListener('click', () => {
      createStickerFromSvg(STICKER_SVGS.fb_love, 'Heart Reaction');
    });
  }

  // Sticker Editor Controls
  const rotSlider = document.getElementById('stickerRotSlider');
  if (rotSlider) {
    rotSlider.addEventListener('input', e => {
      const sticker = state.stickers.find(s => s.id === state.selectedStickerId);
      if (!sticker) return;
      sticker.rotation = parseInt(e.target.value, 10);
      document.getElementById('stickerRotVal').textContent = `${sticker.rotation}°`;
      renderCanvas();
    });
    rotSlider.addEventListener('change', pushState);
  }

  const rot45Btn = document.getElementById('stickerRot45Btn');
  if (rot45Btn) {
    rot45Btn.addEventListener('click', () => {
      const sticker = state.stickers.find(s => s.id === state.selectedStickerId);
      if (!sticker) return;
      let newRot = (sticker.rotation || 0) + 45;
      while (newRot > 180) newRot -= 360;
      sticker.rotation = newRot;
      if (rotSlider) rotSlider.value = newRot;
      document.getElementById('stickerRotVal').textContent = `${newRot}°`;
      pushState();
      renderCanvas();
    });
  }

  const rotResetBtn = document.getElementById('stickerRotResetBtn');
  if (rotResetBtn) {
    rotResetBtn.addEventListener('click', () => {
      const sticker = state.stickers.find(s => s.id === state.selectedStickerId);
      if (!sticker) return;
      sticker.rotation = 0;
      if (rotSlider) rotSlider.value = 0;
      document.getElementById('stickerRotVal').textContent = '0°';
      pushState();
      renderCanvas();
    });
  }

  const sizeSlider = document.getElementById('stickerSizeSlider');
  if (sizeSlider) {
    sizeSlider.addEventListener('input', e => {
      const sticker = state.stickers.find(s => s.id === state.selectedStickerId);
      if (!sticker) return;
      const newSize = parseInt(e.target.value, 10);
      const ratio = sticker.height / sticker.width;
      sticker.width = newSize;
      sticker.height = Math.round(newSize * ratio);
      document.getElementById('stickerSizeVal').textContent = `${newSize}px`;
      renderCanvas();
    });
    sizeSlider.addEventListener('change', pushState);
  }

  const opacitySlider = document.getElementById('stickerOpacitySlider');
  if (opacitySlider) {
    opacitySlider.addEventListener('input', e => {
      const sticker = state.stickers.find(s => s.id === state.selectedStickerId);
      if (!sticker) return;
      sticker.opacity = parseFloat(e.target.value);
      document.getElementById('stickerOpacityVal').textContent = `${Math.round(sticker.opacity * 100)}%`;
      renderCanvas();
    });
    opacitySlider.addEventListener('change', pushState);
  }

  const shadowSliderEl = document.getElementById('stickerShadowSlider');
  if (shadowSliderEl) {
    shadowSliderEl.addEventListener('input', e => {
      const sticker = state.stickers.find(s => s.id === state.selectedStickerId);
      if (!sticker) return;
      sticker.shadowBlur = parseInt(e.target.value, 10);
      renderCanvas();
    });
    shadowSliderEl.addEventListener('change', pushState);
  }

  // Sticker Layer Order Buttons
  const bringFwdBtn = document.getElementById('stickerBringForwardBtn');
  if (bringFwdBtn) {
    bringFwdBtn.addEventListener('click', () => {
      const idx = state.stickers.findIndex(s => s.id === state.selectedStickerId);
      if (idx < state.stickers.length - 1) {
        const item = state.stickers.splice(idx, 1)[0];
        state.stickers.splice(idx + 1, 0, item);
        pushState();
        renderCanvas();
      }
    });
  }

  const sendBwdBtn = document.getElementById('stickerSendBackwardBtn');
  if (sendBwdBtn) {
    sendBwdBtn.addEventListener('click', () => {
      const idx = state.stickers.findIndex(s => s.id === state.selectedStickerId);
      if (idx > 0) {
        const item = state.stickers.splice(idx, 1)[0];
        state.stickers.splice(idx - 1, 0, item);
        pushState();
        renderCanvas();
      }
    });
  }

  const bringTopBtn = document.getElementById('stickerBringToFrontBtn');
  if (bringTopBtn) {
    bringTopBtn.addEventListener('click', () => {
      const idx = state.stickers.findIndex(s => s.id === state.selectedStickerId);
      if (idx !== -1) {
        const item = state.stickers.splice(idx, 1)[0];
        state.stickers.push(item);
        pushState();
        renderCanvas();
      }
    });
  }

  const sendBotBtn = document.getElementById('stickerSendToBackBtn');
  if (sendBotBtn) {
    sendBotBtn.addEventListener('click', () => {
      const idx = state.stickers.findIndex(s => s.id === state.selectedStickerId);
      if (idx !== -1) {
        const item = state.stickers.splice(idx, 1)[0];
        state.stickers.unshift(item);
        pushState();
        renderCanvas();
      }
    });
  }

  const deleteStickerBtn = document.getElementById('deleteStickerBtn');
  if (deleteStickerBtn) {
    deleteStickerBtn.addEventListener('click', () => {
      state.stickers = state.stickers.filter(s => s.id !== state.selectedStickerId);
      state.selectedStickerId = null;
      pushState();
      updateUI();
      renderCanvas();
      showToast('Sticker deleted');
    });
  }

  // --- Background Controls ---
  document.getElementById('bgUploadInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      const dataUri = ev.target.result;
      const img = new Image();
      img.onload = () => {
        state.bgCustomImage = img;
        state.bgCustomImageData = dataUri;
        state.bgType = 'custom';
        pushState();
        renderCanvas();
        showToast('Custom Background Applied & Saved with Preset');
      };
      img.src = dataUri;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('clearBgBtn').addEventListener('click', () => {
    state.bgCustomImage = null;
    state.bgCustomImageData = null;
    state.bgType = 'preset';
    pushState();
    renderCanvas();
    showToast('Reverted to Preset Background');
  });

  document.querySelectorAll('.bg-preset-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.bg-preset-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.bgPreset = card.dataset.bg;
      state.bgType = 'preset';
      pushState();
      renderCanvas();
      showToast(`Background set to ${state.bgPreset}`);
    });
  });

  document.getElementById('bgDarkOverlaySlider').addEventListener('input', e => {
    state.bgDarkOverlay = parseFloat(e.target.value);
    renderCanvas();
  });
  document.getElementById('bgDarkOverlaySlider').addEventListener('change', pushState);

  document.getElementById('bgVignetteSlider').addEventListener('input', e => {
    state.bgVignette = parseFloat(e.target.value);
    renderCanvas();
  });
  document.getElementById('bgVignetteSlider').addEventListener('change', pushState);

  // --- Aspect Ratio Buttons ---
  document.getElementById('ratio34Btn').addEventListener('click', () => {
    document.getElementById('ratio34Btn').classList.add('active');
    document.getElementById('ratio11Btn').classList.remove('active');
    state.aspectRatio = '3:4';
    state.canvasWidth = 1080;
    state.canvasHeight = 1440;
    canvas.width = 1080;
    canvas.height = 1440;
    document.getElementById('canvasDimsBadge').textContent = '1080 × 1440 px (3:4)';
    fitScreen();
    pushState();
    renderCanvas();
  });

  document.getElementById('ratio11Btn').addEventListener('click', () => {
    document.getElementById('ratio11Btn').classList.add('active');
    document.getElementById('ratio34Btn').classList.remove('active');
    state.aspectRatio = '1:1';
    state.canvasWidth = 1080;
    state.canvasHeight = 1080;
    canvas.width = 1080;
    canvas.height = 1080;
    document.getElementById('canvasDimsBadge').textContent = '1080 × 1080 px (1:1)';
    fitScreen();
    pushState();
    renderCanvas();
  });

  // --- Tab Navigation ---
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(btn.dataset.tab);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // --- Preset Template Buttons ---
  document.getElementById('presetDiamondBtn').addEventListener('click', e => {
    document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    loadPresetDiamond();
  });

  document.getElementById('presetRectBtn').addEventListener('click', e => {
    document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    loadPresetBoxCenterpiece();
  });

  document.getElementById('presetOvalBtn').addEventListener('click', e => {
    document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    loadPresetOvalCameo();
  });

  document.getElementById('presetGrid6Btn').addEventListener('click', e => {
    document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    loadPreset6Grid();
  });

  const presetViralBtn = document.getElementById('presetViralTeaserBtn');
  if (presetViralBtn) {
    presetViralBtn.addEventListener('click', e => {
      document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      loadPresetViralTeaser();
    });
  }

  // --- Story Teaser Card Tab Event Handlers ---
  function ensureTeaserCard() {
    if (!state.teaserCard) {
      state.teaserCard = {
        enabled: true,
        x: 45,
        y: 1010,
        width: 990,
        height: 185,
        bgColor: '#0d0f14',
        borderColor: '#b68c43',
        borderWidth: 2,
        cornerRadius: 14,
        badgeIcon: 'crown',
        line1: 'At just 4 years old,',
        line2: 'he was already',
        line2Highlight: 'impersonating',
        line3Highlight: 'Elvis...',
        ctaText: 'Read the full story in caption →'
      };
    }
  }

  const teaserToggle = document.getElementById('teaserCardEnabledToggle');
  if (teaserToggle) {
    teaserToggle.addEventListener('change', e => {
      ensureTeaserCard();
      state.teaserCard.enabled = e.target.checked;
      pushState();
      renderCanvas();
    });
  }

  const teaserL1 = document.getElementById('teaserLine1Input');
  if (teaserL1) {
    teaserL1.addEventListener('input', e => {
      ensureTeaserCard();
      state.teaserCard.line1 = e.target.value;
      renderCanvas();
    });
    teaserL1.addEventListener('change', pushState);
  }

  const teaserL2 = document.getElementById('teaserLine2Input');
  if (teaserL2) {
    teaserL2.addEventListener('input', e => {
      ensureTeaserCard();
      state.teaserCard.line2 = e.target.value;
      renderCanvas();
    });
    teaserL2.addEventListener('change', pushState);
  }

  const teaserL2Hl = document.getElementById('teaserLine2HighlightInput');
  if (teaserL2Hl) {
    teaserL2Hl.addEventListener('input', e => {
      ensureTeaserCard();
      state.teaserCard.line2Highlight = e.target.value;
      renderCanvas();
    });
    teaserL2Hl.addEventListener('change', pushState);
  }

  const teaserL3Hl = document.getElementById('teaserLine3HighlightInput');
  if (teaserL3Hl) {
    teaserL3Hl.addEventListener('input', e => {
      ensureTeaserCard();
      state.teaserCard.line3Highlight = e.target.value;
      renderCanvas();
    });
    teaserL3Hl.addEventListener('change', pushState);
  }

  const teaserCta = document.getElementById('teaserCtaInput');
  if (teaserCta) {
    teaserCta.addEventListener('input', e => {
      ensureTeaserCard();
      state.teaserCard.ctaText = e.target.value;
      renderCanvas();
    });
    teaserCta.addEventListener('change', pushState);
  }

  const teaserYS = document.getElementById('teaserYSlider');
  if (teaserYS) {
    teaserYS.addEventListener('input', e => {
      ensureTeaserCard();
      state.teaserCard.y = parseInt(e.target.value, 10);
      document.getElementById('teaserYVal').textContent = `${state.teaserCard.y}px`;
      renderCanvas();
    });
    teaserYS.addEventListener('change', pushState);
  }

  const teaserHS = document.getElementById('teaserHeightSlider');
  if (teaserHS) {
    teaserHS.addEventListener('input', e => {
      ensureTeaserCard();
      state.teaserCard.height = parseInt(e.target.value, 10);
      document.getElementById('teaserHeightVal').textContent = `${state.teaserCard.height}px`;
      renderCanvas();
    });
    teaserHS.addEventListener('change', pushState);
  }

  document.querySelectorAll('.badge-icon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.badge-icon-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ensureTeaserCard();
      state.teaserCard.badgeIcon = btn.dataset.icon;
      pushState();
      renderCanvas();
    });
  });

  // Celebrity Hook Preset Buttons
  const hookElvisBtn = document.getElementById('presetTeaserElvisBtn');
  if (hookElvisBtn) {
    hookElvisBtn.addEventListener('click', () => {
      ensureTeaserCard();
      state.teaserCard.line1 = 'At just 4 years old,';
      state.teaserCard.line2 = 'he was already';
      state.teaserCard.line2Highlight = 'impersonating';
      state.teaserCard.line3Highlight = 'Elvis...';
      state.teaserCard.badgeIcon = 'crown';
      updateUI();
      pushState();
      renderCanvas();
      showToast('Applied Bruno Mars / Elvis hook');
    });
  }

  const hookSimonBtn = document.getElementById('presetTeaserSimonBtn');
  if (hookSimonBtn) {
    hookSimonBtn.addEventListener('click', () => {
      ensureTeaserCard();
      state.teaserCard.line1 = 'Fired from his own label,';
      state.teaserCard.line2 = 'he was told he was';
      state.teaserCard.line2Highlight = 'too rude and ugly';
      state.teaserCard.line3Highlight = 'for television...';
      state.teaserCard.badgeIcon = 'star';
      updateUI();
      pushState();
      renderCanvas();
      showToast('Applied Simon Cowell hook');
    });
  }

  const hookToniBtn = document.getElementById('presetTeaserToniBtn');
  if (hookToniBtn) {
    hookToniBtn.addEventListener('click', () => {
      ensureTeaserCard();
      state.teaserCard.line1 = 'Singing at a gas station,';
      state.teaserCard.line2 = 'she was discovered by';
      state.teaserCard.line2Highlight = 'a chance encounter';
      state.teaserCard.line3Highlight = 'that changed music...';
      state.teaserCard.badgeIcon = 'crown';
      updateUI();
      pushState();
      renderCanvas();
      showToast('Applied Toni Braxton hook');
    });
  }

  // --- Quick Frame Count Selector (4, 6, 8, 10 Photos) ---
  document.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const count = parseInt(e.currentTarget.dataset.count, 10);
      setQuickFrameCount(count);
    });
  });

  // --- Undo / Redo Buttons & Keybindings ---
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selectedStickerId) {
        document.getElementById('deleteStickerBtn').click();
      } else if (state.selectedFrameId) {
        document.getElementById('deleteFrameBtn').click();
      } else if (state.selectedTextId) {
        document.getElementById('deleteTextBtn').click();
      }
    }
  });

  // --- Zoom Buttons ---
  document.getElementById('zoomInBtn').addEventListener('click', () => setZoom(state.zoom + 0.1));
  document.getElementById('zoomOutBtn').addEventListener('click', () => setZoom(state.zoom - 0.1));
  document.getElementById('fitScreenBtn').addEventListener('click', fitScreen);

  // =========================================================
  // Instant Saved Presets System (Persistent in LocalStorage)
  // =========================================================
  const STORAGE_KEY = 'retrolegend_user_presets';

  function getDefaultPresets() {
    return [
      {
        id: 'usr_default_viral_teaser',
        name: 'Viral Story & Teaser (Bruno Mars Style)',
        createdAt: Date.now() - 3600000 * 2,
        canvasWidth: 1080,
        canvasHeight: 1440,
        aspectRatio: '3:4',
        bgPreset: 'ivory_editorial',
        bgDarkOverlay: 0.0,
        bgVignette: 0.0,
        frames: [
          { label: '★ Hero Portrait', x: 0, y: 140, width: 1080, height: 530, shape: 'white_rect', borderWidth: 0, borderColor: '#ffffff', cornerRadius: 0, shadowBlur: 10, rotation: 0 },
          { label: 'Milestone 1 (Childhood)', x: 16, y: 640, width: 265, height: 325, shape: 'white_rect', borderWidth: 12, borderColor: '#ffffff', cornerRadius: 3, shadowBlur: 24, rotation: -4 },
          { label: 'Milestone 2 (Teen/Debut)', x: 275, y: 665, width: 255, height: 310, shape: 'white_rect', borderWidth: 12, borderColor: '#ffffff', cornerRadius: 3, shadowBlur: 20, rotation: -1 },
          { label: 'Milestone 3 (Peak Era)', x: 520, y: 670, width: 250, height: 305, shape: 'white_rect', borderWidth: 12, borderColor: '#ffffff', cornerRadius: 3, shadowBlur: 20, rotation: 2 },
          { label: 'Milestone 4 (Legend Now)', x: 760, y: 655, width: 285, height: 325, shape: 'white_rect', borderWidth: 12, borderColor: '#ffffff', cornerRadius: 3, shadowBlur: 25, rotation: 3 }
        ],
        textLayers: [
          { text: '—  HAPPY BIRTHDAY  —', fontFamily: "'Cinzel', serif", fontSize: 22, fontWeight: 700, color: '#b68c43', x: 540, y: 48, align: 'center', glow: 0, letterSpacing: 8 },
          { text: 'BRUNO MARS', fontFamily: "'DM Serif Display', serif", fontSize: 66, fontWeight: 700, color: '#0d0d0d', x: 435, y: 102, align: 'right', glow: 0, letterSpacing: 2 },
          { text: '• 41', fontFamily: "'DM Serif Display', serif", fontSize: 66, fontWeight: 700, color: '#b68c43', x: 455, y: 102, align: 'left', glow: 0, letterSpacing: 2 },
          { text: 'Bruno Mars', fontFamily: "'Allura', cursive", fontSize: 72, fontWeight: 700, color: '#dfb15b', x: 880, y: 480, align: 'center', glow: 12, letterSpacing: 1 }
        ],
        stickers: [
          { label: 'Crown Emblem', x: 855, y: 395, width: 60, height: 45, rotation: 0, opacity: 0.95, shadowBlur: 10, iconType: 'crown' }
        ],
        teaserCard: {
          enabled: true,
          x: 45,
          y: 1010,
          width: 990,
          height: 185,
          bgColor: '#0d0f14',
          borderColor: '#b68c43',
          borderWidth: 2,
          cornerRadius: 14,
          badgeIcon: 'crown',
          line1: 'At just 4 years old,',
          line2: 'he was already',
          line2Highlight: 'impersonating',
          line3Highlight: 'Elvis...',
          ctaText: 'Read the full story in caption →'
        }
      },
      {
        id: 'usr_default_1',
        name: 'Kate Winslet 5-Frame Diamond Hero',
        createdAt: Date.now() - 86400000 * 2,
        canvasWidth: 1080,
        canvasHeight: 1440,
        aspectRatio: '3:4',
        bgPreset: 'noir',
        bgDarkOverlay: 0.2,
        bgVignette: 0.5,
        frames: [
          { label: 'Top-Left Era', x: 40, y: 160, width: 480, height: 500, shape: 'rect-gold', borderWidth: 4, borderColor: '#d4af37', cornerRadius: 4, shadowBlur: 15 },
          { label: 'Top-Right Era', x: 560, y: 160, width: 480, height: 500, shape: 'rect-gold', borderWidth: 4, borderColor: '#d4af37', cornerRadius: 4, shadowBlur: 15 },
          { label: 'Bottom-Left Era', x: 40, y: 760, width: 480, height: 520, shape: 'rect-gold', borderWidth: 4, borderColor: '#d4af37', cornerRadius: 4, shadowBlur: 15 },
          { label: 'Bottom-Right Era', x: 560, y: 760, width: 480, height: 520, shape: 'rect-gold', borderWidth: 4, borderColor: '#d4af37', cornerRadius: 4, shadowBlur: 15 },
          { label: '★ Center Diamond Hero', x: 260, y: 440, width: 560, height: 560, shape: 'diamond', borderWidth: 10, borderColor: '#f3e5ab', cornerRadius: 0, shadowBlur: 35 }
        ],
        textLayers: [
          { text: 'Kate Winslet', fontFamily: 'Alex Brush', fontSize: 88, fontWeight: 700, strokeWidth: 1.5, color: '#f3e5ab', x: 540, y: 1040, align: 'center', glow: true, letterSpacing: 2 }
        ],
        stickers: []
      },
      {
        id: 'usr_default_2',
        name: 'Susan Sarandon 6-Grid Centerpiece',
        createdAt: Date.now() - 86400000,
        canvasWidth: 1080,
        canvasHeight: 1440,
        aspectRatio: '3:4',
        bgPreset: 'crimson',
        bgDarkOverlay: 0.25,
        bgVignette: 0.5,
        frames: [
          { label: 'Corner TL', x: 40, y: 160, width: 480, height: 350, shape: 'rect-white', borderWidth: 5, borderColor: '#ffffff', cornerRadius: 6, shadowBlur: 15 },
          { label: 'Corner TR', x: 560, y: 160, width: 480, height: 350, shape: 'rect-white', borderWidth: 5, borderColor: '#ffffff', cornerRadius: 6, shadowBlur: 15 },
          { label: 'Mid Left', x: 40, y: 535, width: 480, height: 350, shape: 'rect-white', borderWidth: 5, borderColor: '#ffffff', cornerRadius: 6, shadowBlur: 15 },
          { label: 'Mid Right', x: 560, y: 535, width: 480, height: 350, shape: 'rect-white', borderWidth: 5, borderColor: '#ffffff', cornerRadius: 6, shadowBlur: 15 },
          { label: 'Bottom Left', x: 40, y: 910, width: 480, height: 380, shape: 'rect-white', borderWidth: 5, borderColor: '#ffffff', cornerRadius: 6, shadowBlur: 15 },
          { label: 'Bottom Right', x: 560, y: 910, width: 480, height: 380, shape: 'rect-white', borderWidth: 5, borderColor: '#ffffff', cornerRadius: 6, shadowBlur: 15 },
          { label: '★ Star Centerpiece', x: 270, y: 450, width: 540, height: 540, shape: 'rect-gold', borderWidth: 10, borderColor: '#f3e5ab', cornerRadius: 12, shadowBlur: 35 }
        ],
        textLayers: [
          { text: 'Susan Sarandon', fontFamily: 'Great Vibes', fontSize: 82, fontWeight: 700, strokeWidth: 1.5, color: '#f3e5ab', x: 540, y: 1010, align: 'center', glow: true, letterSpacing: 2 }
        ],
        stickers: []
      },
      {
        id: 'usr_default_3',
        name: 'Vintage Oval Cameo (Janis Joplin)',
        createdAt: Date.now() - 3600000 * 4,
        canvasWidth: 1080,
        canvasHeight: 1440,
        aspectRatio: '3:4',
        bgPreset: 'emerald',
        bgDarkOverlay: 0.2,
        bgVignette: 0.5,
        frames: [
          { label: 'Grid Top Left', x: 50, y: 160, width: 460, height: 500, shape: 'rect-gold', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 8, shadowBlur: 15 },
          { label: 'Grid Top Right', x: 570, y: 160, width: 460, height: 500, shape: 'rect-gold', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 8, shadowBlur: 15 },
          { label: 'Grid Btm Left', x: 50, y: 780, width: 460, height: 500, shape: 'rect-gold', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 8, shadowBlur: 15 },
          { label: 'Grid Btm Right', x: 570, y: 780, width: 460, height: 500, shape: 'rect-gold', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 8, shadowBlur: 15 },
          { label: '★ Oval Cameo Portrait', x: 290, y: 420, width: 500, height: 600, shape: 'oval', borderWidth: 10, borderColor: '#f3e5ab', cornerRadius: 0, shadowBlur: 35 }
        ],
        textLayers: [
          { text: 'Janis Joplin', fontFamily: 'Alex Brush', fontSize: 90, fontWeight: 700, strokeWidth: 1.5, color: '#f3e5ab', x: 540, y: 1040, align: 'center', glow: true, letterSpacing: 2 }
        ],
        stickers: []
      },
      {
        id: 'usr_default_4',
        name: 'Royal Gold 8-Photo Memorial',
        createdAt: Date.now() - 3600000 * 12,
        canvasWidth: 1080,
        canvasHeight: 1440,
        aspectRatio: '3:4',
        bgPreset: 'royal',
        bgDarkOverlay: 0.2,
        bgVignette: 0.5,
        frames: [
          { label: 'Photo 1', x: 40, y: 150, width: 480, height: 260, shape: 'rect-gold', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12 },
          { label: 'Photo 2', x: 560, y: 150, width: 480, height: 260, shape: 'rect-gold', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12 },
          { label: 'Photo 3', x: 40, y: 440, width: 480, height: 260, shape: 'rect-gold', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12 },
          { label: 'Photo 4', x: 560, y: 440, width: 480, height: 260, shape: 'rect-gold', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12 },
          { label: 'Photo 5', x: 40, y: 730, width: 480, height: 260, shape: 'rect-gold', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12 },
          { label: 'Photo 6', x: 560, y: 730, width: 480, height: 260, shape: 'rect-gold', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12 },
          { label: 'Photo 7', x: 40, y: 1020, width: 480, height: 280, shape: 'rect-gold', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12 },
          { label: 'Photo 8', x: 560, y: 1020, width: 480, height: 280, shape: 'rect-gold', borderWidth: 3, borderColor: '#d4af37', cornerRadius: 6, shadowBlur: 12 }
        ],
        textLayers: [
          { text: 'In Loving Memory', fontFamily: 'Cinzel', fontSize: 44, fontWeight: 600, strokeWidth: 0, color: '#f3e5ab', x: 540, y: 80, align: 'center', glow: true, letterSpacing: 4 }
        ],
        stickers: []
      },
      {
        id: 'usr_default_5',
        name: 'Classic Retro Romance (4 Photos)',
        createdAt: Date.now() - 3600000 * 24,
        canvasWidth: 1080,
        canvasHeight: 1440,
        aspectRatio: '3:4',
        bgPreset: 'noir',
        bgDarkOverlay: 0.25,
        bgVignette: 0.6,
        frames: [
          { label: 'Memory 1', x: 50, y: 160, width: 470, height: 520, shape: 'rect-gold', borderWidth: 5, borderColor: '#d4af37', cornerRadius: 8, shadowBlur: 18 },
          { label: 'Memory 2', x: 560, y: 160, width: 470, height: 520, shape: 'rect-gold', borderWidth: 5, borderColor: '#d4af37', cornerRadius: 8, shadowBlur: 18 },
          { label: 'Memory 3', x: 50, y: 740, width: 470, height: 540, shape: 'rect-gold', borderWidth: 5, borderColor: '#d4af37', cornerRadius: 8, shadowBlur: 18 },
          { label: 'Memory 4', x: 560, y: 740, width: 470, height: 540, shape: 'rect-gold', borderWidth: 5, borderColor: '#d4af37', cornerRadius: 8, shadowBlur: 18 }
        ],
        textLayers: [
          { text: 'Everlasting Tribute', fontFamily: 'Parisienne', fontSize: 78, fontWeight: 700, strokeWidth: 1, color: '#f3e5ab', x: 540, y: 100, align: 'center', glow: true, letterSpacing: 2 }
        ],
        stickers: []
      }
    ];
  }

  function getCustomPresets() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const defaults = getDefaultPresets();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
        return defaults;
      }
      return JSON.parse(raw);
    } catch (e) {
      return getDefaultPresets();
    }
  }

  function saveCustomPreset(name) {
    const presets = getCustomPresets();
    const newPreset = {
      id: uid('usr_preset'),
      name: name.trim() || `Preset ${presets.length + 1}`,
      createdAt: Date.now(),
      canvasWidth: state.canvasWidth,
      canvasHeight: state.canvasHeight,
      aspectRatio: state.aspectRatio,
      bgType: state.bgType || 'preset',
      bgPreset: state.bgPreset || 'noir',
      bgCustomImage: state.bgCustomImageData || (state.bgCustomImage ? state.bgCustomImage.src : null),
      bgDarkOverlay: state.bgDarkOverlay,
      bgVignette: state.bgVignette,
      frames: state.frames.map(f => ({
        label: f.label,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        shape: f.shape,
        borderWidth: f.borderWidth,
        borderColor: f.borderColor,
        cornerRadius: f.cornerRadius,
        shadowBlur: f.shadowBlur,
        rotation: f.rotation || 0
      })),
      textLayers: state.textLayers.map(t => ({
        text: t.text,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight || 600,
        strokeWidth: t.strokeWidth || 0,
        color: t.color,
        x: t.x,
        y: t.y,
        align: t.align,
        glow: t.glow,
        letterSpacing: t.letterSpacing
      })),
      stickers: state.stickers.map(s => ({
        label: s.label,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        rotation: s.rotation,
        opacity: s.opacity,
        shadowBlur: s.shadowBlur,
        src: s.imgElement ? s.imgElement.src : null
      })),
      teaserCard: state.teaserCard ? { ...state.teaserCard } : null
    };

    presets.push(newPreset);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
    renderUserPresetsBar(newPreset.id);
    renderHomePagePresets();

    // Automatically open the dropdown so user sees their new preset in the box
    const menu = document.getElementById('presetDropdownMenu');
    const trigger = document.getElementById('presetDropdownTrigger');
    if (menu) menu.classList.add('open');
    if (trigger) trigger.classList.add('open');

    showToast(`⭐ Preset "${newPreset.name}" saved!`);
    return newPreset;
  }

  function deleteCustomPreset(presetId) {
    let presets = getCustomPresets();
    presets = presets.filter(p => p.id !== presetId);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    } catch (e) {}
    renderUserPresetsBar();
    renderHomePagePresets();
    showToast('Preset deleted');
  }

  function loadCustomPreset(presetId) {
    const presets = getCustomPresets();
    const target = presets.find(p => p.id === presetId);
    if (!target) return;

    // Preserve any existing photos already uploaded by user
    const existingImages = state.frames.map(f => ({
      imgElement: f.imgElement,
      imgScale: f.imgScale || 1,
      imgPanX: f.imgPanX || 0,
      imgPanY: f.imgPanY || 0
    })).filter(item => item.imgElement !== null);

    state.canvasWidth = target.canvasWidth || 1080;
    state.canvasHeight = target.canvasHeight || 1440;
    canvas.width = state.canvasWidth;
    canvas.height = state.canvasHeight;
    state.aspectRatio = target.aspectRatio || '3:4';

    state.frames = target.frames.map((f, idx) => ({
      ...f,
      id: uid('frame'),
      imgElement: existingImages[idx] ? existingImages[idx].imgElement : null,
      imgScale: existingImages[idx] ? existingImages[idx].imgScale : 1,
      imgPanX: existingImages[idx] ? existingImages[idx].imgPanX : 0,
      imgPanY: existingImages[idx] ? existingImages[idx].imgPanY : 0
    }));

    state.textLayers = (target.textLayers || []).map(t => ({
      ...t,
      id: uid('text')
    }));

    state.stickers = [];
    if (target.stickers && target.stickers.length) {
      target.stickers.forEach(s => {
        if (s.src) {
          const img = new Image();
          img.onload = () => { renderCanvas(); };
          img.src = s.src;
          state.stickers.push({ ...s, id: uid('sticker'), imgElement: img });
        }
      });
    }

    state.bgType = target.bgType || (target.bgCustomImage ? 'custom' : 'preset');
    state.bgPreset = target.bgPreset || 'noir';
    state.bgDarkOverlay = target.bgDarkOverlay !== undefined ? target.bgDarkOverlay : 0.2;
    state.bgVignette = target.bgVignette !== undefined ? target.bgVignette : 0.5;

    if (target.bgCustomImage) {
      state.bgType = 'custom';
      state.bgCustomImageData = target.bgCustomImage;
      const bgImg = new Image();
      bgImg.onload = () => {
        state.bgCustomImage = bgImg;
        renderCanvas();
      };
      bgImg.src = target.bgCustomImage;
    } else {
      state.bgCustomImage = null;
      state.bgCustomImageData = null;
    }

    state.selectedFrameId = state.frames[0] ? state.frames[0].id : null;
    state.selectedTextId = null;
    state.selectedStickerId = null;
    state.teaserCard = target.teaserCard ? { ...target.teaserCard } : null;

    // Highlight active preset in topbar and dropdown list
    document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
    const dropdownTrigger = document.getElementById('presetDropdownTrigger');
    if (dropdownTrigger) dropdownTrigger.classList.add('active');

    document.querySelectorAll('.dropdown-preset-item').forEach(b => {
      b.classList.toggle('active', b.dataset.id === presetId);
    });

    pushState();
    updateUI();
    renderCanvas();
    showToast(`Loaded Preset "${target.name}"`);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }

  function renderUserPresetsBar(activeId = null) {
    const list = document.getElementById('userPresetsDropdownList');
    const badge = document.getElementById('userPresetCountBadge');
    const headerCount = document.getElementById('dropdownHeaderCount');

    const presets = getCustomPresets();
    if (badge) badge.textContent = presets.length;
    if (headerCount) headerCount.textContent = presets.length;

    if (!list) return;
    list.innerHTML = '';

    if (presets.length === 0) {
      list.innerHTML = `
        <div class="dropdown-empty">
          <div style="font-size: 20px; margin-bottom: 6px;">📂</div>
          No saved presets yet.<br>
          <span style="font-size: 11px; color: var(--text-dim); margin-top: 4px; display: inline-block;">
            Click "<strong>+ Save Current</strong>" to instantly save your layout!
          </span>
        </div>
      `;
      return;
    }

    presets.forEach(p => {
      const item = document.createElement('div');
      item.className = `dropdown-preset-item ${p.id === activeId ? 'active' : ''}`;
      item.dataset.id = p.id;
      item.title = `Click to load: ${p.name}`;

      const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
      const photoCount = p.frames ? p.frames.length : 6;
      const ratio = p.aspectRatio || '3:4';

      item.innerHTML = `
        <div class="preset-item-info">
          <span class="preset-item-title">★ ${escapeHtml(p.name)}</span>
          <span class="preset-item-meta">${photoCount} Photos • ${ratio}${dateStr ? ' • ' + dateStr : ''}</span>
        </div>
        <button class="preset-delete-icon" data-del="${p.id}" title="Delete preset">&times;</button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.preset-delete-icon')) {
          e.stopPropagation();
          if (confirm(`Delete saved preset "${p.name}"?`)) {
            deleteCustomPreset(p.id);
          }
          return;
        }
        loadCustomPreset(p.id);
        // Close dropdown after loading preset
        const menu = document.getElementById('presetDropdownMenu');
        const trigger = document.getElementById('presetDropdownTrigger');
        if (menu) menu.classList.remove('open');
        if (trigger) trigger.classList.remove('open');
      });

      list.appendChild(item);
    });
  }

  // --- Preset Dropdown Menu Interactions ---
  const presetTrigger = document.getElementById('presetDropdownTrigger');
  const presetMenu = document.getElementById('presetDropdownMenu');
  if (presetTrigger && presetMenu) {
    presetTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = presetMenu.classList.toggle('open');
      presetTrigger.classList.toggle('open', isOpen);
    });
  }

  // Close dropdown on outside click or Escape key
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('presetDropdownWrap');
    if (wrap && !wrap.contains(e.target)) {
      if (presetMenu) presetMenu.classList.remove('open');
      if (presetTrigger) presetTrigger.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (presetMenu) presetMenu.classList.remove('open');
      if (presetTrigger) presetTrigger.classList.remove('open');
    }
  });

  // Save current preset from dropdown header "+ Save Current" button
  const saveDropdownBtn = document.getElementById('savePresetFromDropdownBtn');
  if (saveDropdownBtn) {
    saveDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const defaultName = `Custom ${getCustomPresets().length + 1}`;
      const name = prompt('Enter a name for this custom preset:', defaultName);
      if (name && name.trim()) {
        saveCustomPreset(name.trim());
      }
    });
  }

  // Topbar quick save preset button
  const quickSaveBtn = document.getElementById('quickSavePresetBtn');
  if (quickSaveBtn) {
    quickSaveBtn.addEventListener('click', () => {
      const defaultName = `My Layout ${getCustomPresets().length + 1}`;
      const name = prompt('Enter a name for this custom preset:', defaultName);
      if (name && name.trim()) {
        saveCustomPreset(name.trim());
      }
    });
  }

  // --- Template Save / Load ---
  document.getElementById('saveTemplateBtn').addEventListener('click', () => {
    const templateData = {
      version: 1,
      canvasWidth: state.canvasWidth,
      canvasHeight: state.canvasHeight,
      aspectRatio: state.aspectRatio,
      bgType: state.bgType || 'preset',
      bgPreset: state.bgPreset || 'noir',
      bgCustomImage: state.bgCustomImageData || (state.bgCustomImage ? state.bgCustomImage.src : null),
      bgDarkOverlay: state.bgDarkOverlay,
      bgVignette: state.bgVignette,
      frames: state.frames.map(f => ({
        label: f.label,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        shape: f.shape,
        borderWidth: f.borderWidth,
        borderColor: f.borderColor,
        cornerRadius: f.cornerRadius,
        shadowBlur: f.shadowBlur,
        rotation: f.rotation || 0
      })),
      textLayers: state.textLayers.map(t => ({
        text: t.text,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        color: t.color,
        x: t.x,
        y: t.y,
        align: t.align,
        glow: t.glow,
        letterSpacing: t.letterSpacing
      })),
      stickers: state.stickers.map(s => ({
        label: s.label,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        rotation: s.rotation,
        opacity: s.opacity,
        shadowBlur: s.shadowBlur,
        src: s.imgElement ? s.imgElement.src : null
      })),
      teaserCard: state.teaserCard ? { ...state.teaserCard } : null
    };

    const blob = new Blob([JSON.stringify(templateData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tribute_template_${Date.now()}.json`;
    a.click();
    showToast('Template Saved (JSON)');
  });

  document.getElementById('loadTemplateBtn').addEventListener('click', () => {
    document.getElementById('templateFileInput').click();
  });

  document.getElementById('templateFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.frames) {
          state.frames = data.frames.map(f => ({ ...f, id: uid('frame'), imgElement: null, imgScale: 1, imgPanX: 0, imgPanY: 0 }));
          state.textLayers = (data.textLayers || []).map(t => ({ ...t, id: uid('text') }));
          state.stickers = [];
          if (data.stickers && data.stickers.length) {
            data.stickers.forEach(s => {
              if (s.src) {
                const img = new Image();
                img.onload = () => { renderCanvas(); };
                img.src = s.src;
                state.stickers.push({ ...s, id: uid('sticker'), imgElement: img });
              }
            });
          }
          state.bgType = data.bgType || (data.bgCustomImage ? 'custom' : 'preset');
          state.bgPreset = data.bgPreset || 'noir';
          state.bgDarkOverlay = data.bgDarkOverlay !== undefined ? data.bgDarkOverlay : 0.2;
          state.bgVignette = data.bgVignette !== undefined ? data.bgVignette : 0.5;
          if (data.bgCustomImage) {
            state.bgType = 'custom';
            state.bgCustomImageData = data.bgCustomImage;
            const bgImg = new Image();
            bgImg.onload = () => {
              state.bgCustomImage = bgImg;
              renderCanvas();
            };
            bgImg.src = data.bgCustomImage;
          } else {
            state.bgCustomImage = null;
            state.bgCustomImageData = null;
          }
          state.teaserCard = data.teaserCard ? { ...data.teaserCard } : null;
          pushState();
          updateUI();
          renderCanvas();
          showToast('Template Loaded Successfully!');
        }
      } catch (err) {
        alert('Invalid template JSON file');
      }
    };
    reader.readAsText(file);
  });

  // --- Export Full HD Image ---
  document.getElementById('exportBtn').addEventListener('click', () => {
    // Deselect active overlay before rendering export
    deselectAll();
    renderCanvas();

    // Export full resolution image
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Facebook_Tribute_Post_${Date.now()}.png`;
      a.click();
      showToast('🎉 HD Tribute Post Exported!');
    }, 'image/png');
  });

  // =========================================================
  // Home Page View Logic (Saved Presets on Left, New on Right)
  // =========================================================
  const homePageView = document.getElementById('homePageView');

  function renderHomePagePresets() {
    const list = document.getElementById('homePresetsList');
    const badge = document.getElementById('homePresetCountBadge');
    if (!list) return;

    const presets = getCustomPresets();
    if (badge) badge.textContent = `${presets.length} Presets`;
    list.innerHTML = '';

    if (presets.length === 0) {
      list.innerHTML = `
        <div class="home-empty-presets">
          <span class="empty-icon">📂</span>
          <p>No saved presets found yet.</p>
          <span style="font-size:11px; color:var(--text-dim); text-align:center;">
            Pick a starter on the right and click "Open Collage Maker Studio" to start designing!
          </span>
        </div>
      `;
      return;
    }

    presets.forEach(p => {
      const card = document.createElement('div');
      card.className = 'home-preset-card';
      card.dataset.id = p.id;

      const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
      const photoCount = p.frames ? p.frames.length : 6;
      const ratio = p.aspectRatio || '3:4';

      card.innerHTML = `
        <div class="preset-card-visual">
          <span class="preset-visual-icon">★</span>
          <span class="preset-visual-count">${photoCount}P</span>
        </div>
        <div class="preset-card-content">
          <h3 class="preset-card-title">${escapeHtml(p.name)}</h3>
          <div class="preset-card-tags">
            <span class="tag-pill">${ratio}</span>
            <span class="tag-pill">${photoCount} Photos</span>
            ${dateStr ? `<span class="tag-pill">${dateStr}</span>` : ''}
          </div>
        </div>
        <div class="preset-card-actions">
          <button class="btn-open-preset" data-id="${p.id}">Open →</button>
          <button class="btn-del-preset" data-del="${p.id}" title="Delete preset">&times;</button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-del-preset')) {
          e.stopPropagation();
          if (confirm(`Delete saved preset "${p.name}"?`)) {
            deleteCustomPreset(p.id);
          }
          return;
        }

        loadCustomPreset(p.id);
        hideHomePage();
      });

      list.appendChild(card);
    });
  }

  function showHomePage() {
    if (homePageView) {
      homePageView.classList.add('active');
      renderHomePagePresets();
    }
  }

  function hideHomePage() {
    if (homePageView) {
      homePageView.classList.remove('active');
      setTimeout(fitScreen, 60);
    }
  }

  // Navigation triggers to return to Home Page
  const homeNavBtn = document.getElementById('homeNavBtn');
  if (homeNavBtn) homeNavBtn.addEventListener('click', showHomePage);

  const logoHomeBtn = document.getElementById('logoHomeBtn');
  if (logoHomeBtn) logoHomeBtn.addEventListener('click', showHomePage);

  // Starter templates selection on Home Page
  let selectedHomeStarter = 'diamond';
  document.querySelectorAll('.starter-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.starter-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectedHomeStarter = card.dataset.preset;
    });
  });

  // Launch Studio button from Home Page
  const openStudioNewBtn = document.getElementById('openStudioNewBtn');
  if (openStudioNewBtn) {
    openStudioNewBtn.addEventListener('click', () => {
      if (selectedHomeStarter === 'diamond') loadPresetDiamond();
      else if (selectedHomeStarter === 'rect') loadPresetBoxCenterpiece();
      else if (selectedHomeStarter === 'oval') loadPresetOvalCameo();
      else if (selectedHomeStarter === 'grid6') loadPreset6Grid();
      else if (selectedHomeStarter === 'viral_teaser') loadPresetViralTeaser();
      else loadPresetDiamond();

      hideHomePage();
    });
  }

  // --- Initial Startup ---
  window.addEventListener('load', () => {
    loadPresetDiamond(); // Initialize studio canvas in background
    renderUserPresetsBar(); // Initialize dropdown
    renderHomePagePresets(); // Populate home page saved presets
    showHomePage(); // Open Home Page landing screen
  });

  // --- Headless Studio Automation API ---
  window.renderAutomationCollage = async function(payload) {
    const { presetData, celebName, birthYear, age, photoUrls } = payload;
    if (!presetData) return null;

    state.canvasWidth = presetData.canvasWidth || 1080;
    state.canvasHeight = presetData.canvasHeight || 1440;
    canvas.width = state.canvasWidth;
    canvas.height = state.canvasHeight;
    state.aspectRatio = presetData.aspectRatio || '3:4';
    state.bgType = presetData.bgType || (presetData.bgCustomImage ? 'custom' : 'preset');
    state.bgPreset = presetData.bgPreset || 'noir';
    state.bgDarkOverlay = presetData.bgDarkOverlay !== undefined ? presetData.bgDarkOverlay : 0.2;
    state.bgVignette = presetData.bgVignette !== undefined ? presetData.bgVignette : 0.5;

    // Teaser Hook Card
    if (presetData.teaserCard) {
      state.teaserCard = { ...presetData.teaserCard };
    } else {
      state.teaserCard = null;
    }

    const loadPromises = [];

    // Custom background
    if (presetData.bgCustomImage) {
      state.bgType = 'custom';
      state.bgCustomImageData = presetData.bgCustomImage;
      const p = new Promise(resolve => {
        const bgImg = new Image();
        bgImg.onload = () => { state.bgCustomImage = bgImg; resolve(); };
        bgImg.onerror = () => { resolve(); };
        bgImg.src = presetData.bgCustomImage;
      });
      loadPromises.push(p);
    } else {
      state.bgCustomImage = null;
      state.bgCustomImageData = null;
    }

    // Stickers (logo watermarks & vector emblems)
    state.stickers = [];
    (presetData.stickers || []).forEach(s => {
      if (s.src) {
        const p = new Promise(resolve => {
          const img = new Image();
          img.onload = () => {
            state.stickers.push({ ...s, id: uid('sticker'), imgElement: img });
            resolve();
          };
          img.onerror = () => { resolve(); };
          img.src = s.src;
        });
        loadPromises.push(p);
      } else {
        state.stickers.push({ ...s, id: uid('sticker'), imgElement: null });
      }
    });

    // Frames & Photos
    state.frames = (presetData.frames || []).map(f => ({ ...f, id: uid('frame'), imgElement: null }));
    const photos = (photoUrls && photoUrls.length > 0) ? photoUrls : [];
    state.frames.forEach((f, idx) => {
      if (photos.length > 0) {
        const pSrc = photos[idx % photos.length];
        if (pSrc) {
          const p = new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              f.imgElement = img;
              resolve();
            };
            img.onerror = () => {
              resolve();
            };
            img.src = pSrc;
          });
          loadPromises.push(p);
        }
      }
    });

    // Text Layers
    state.textLayers = (presetData.textLayers || []).map(t => {
      let txt = t.text || '';
      const lower = txt.toLowerCase();
      if (lower.includes('happy birthday')) {
        // keep Happy Birthday
      } else if (txt.startsWith('•') || txt.includes('•')) {
        txt = age ? `• ${age}` : '';
      } else if (lower.includes('born') || lower.includes('birth') || lower.includes('age') || lower.includes('19') || lower.includes('20')) {
        if (birthYear) {
          txt = age ? `Born ${birthYear} • Age ${age}` : `Born ${birthYear}`;
        }
      } else {
        if (celebName) {
          txt = celebName;
        }
      }
      return { ...t, id: uid('text'), text: txt };
    });

    // Wait for all assets and fonts
    await Promise.all(loadPromises);

    // Fallback: If any frame failed to load an image, reuse an image from another successfully loaded frame
    const loadedFrames = state.frames.filter(f => f.imgElement);
    if (loadedFrames.length > 0) {
      state.frames.forEach((f, idx) => {
        if (!f.imgElement) {
          f.imgElement = loadedFrames[idx % loadedFrames.length].imgElement;
        }
      });
    }
    if (document.fonts) {
      try {
        for (const t of state.textLayers) {
          const famClean = (t.fontFamily || '').replace(/['"]/g, '').split(',')[0].trim();
          const w = t.fontWeight || 600;
          try { await document.fonts.load(`${w} ${t.fontSize}px "${famClean}"`); } catch (e) {}
          try { await document.fonts.load(`300 ${t.fontSize}px "${famClean}"`); } catch (e) {}
          try { await document.fonts.load(`400 ${t.fontSize}px "${famClean}"`); } catch (e) {}
          try { await document.fonts.load(`500 ${t.fontSize}px "${famClean}"`); } catch (e) {}
          try { await document.fonts.load(`700 ${t.fontSize}px "${famClean}"`); } catch (e) {}
        }
        await document.fonts.ready;
      } catch (e) {}
    }

    // Hide any selection overlay and render
    state.selectedFrameId = null;
    state.selectedTextId = null;
    state.selectedStickerId = null;
    renderCanvas();

    return canvas.toDataURL('image/jpeg', 0.95);
  };

  window.addEventListener('resize', fitScreen);

})();
