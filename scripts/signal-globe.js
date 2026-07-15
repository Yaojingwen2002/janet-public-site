import * as THREE from '../assets/vendor/three.module.js';

const stage = document.querySelector('[data-signal-globe]');
const canvas = document.getElementById('signal-globe-canvas');

if (stage && canvas) {
  const ui = {
    total: document.querySelector('[data-signal-total]'),
    hot: document.querySelector('[data-signal-hot]'),
    edition: document.querySelector('[data-signal-edition]'),
    motion: stage.querySelector('[data-signal-motion]'),
    motionIcon: stage.querySelector('[data-signal-motion-icon]'),
    centerCoordinates: stage.querySelector('[data-signal-center-coordinates]'),
    readout: stage.querySelector('[data-signal-readout]'),
    source: stage.querySelector('[data-signal-source]'),
    location: stage.querySelector('[data-signal-location]'),
    sourceCoordinates: stage.querySelector('[data-signal-source-coordinates]'),
    card: stage.querySelector('[data-signal-card]'),
    cardSource: stage.querySelector('[data-signal-card-source]'),
    cardTime: stage.querySelector('[data-signal-card-time]'),
    cardTitle: stage.querySelector('[data-signal-card-title]'),
    fallback: stage.querySelector('[data-signal-fallback]')
  };

  const SOURCE_ALIASES = {
    'openai-news': ['openai', 'openai.com'],
    'anthropic-news': ['anthropic', 'claude', 'anthropic.com'],
    'google-ai-blog': ['google ai', 'blog.google/technology/ai'],
    'google-research-blog': ['google research', 'research.google'],
    'google-deepmind-blog': ['deepmind', 'deepmind.google'],
    'microsoft-ai-blog': ['microsoft ai', 'blogs.microsoft.com/ai'],
    'microsoft-research-ai': ['microsoft research', 'microsoft.com/en-us/research'],
    'github-blog': ['github', 'github.blog'],
    'huggingface-blog': ['hugging face', 'huggingface.co/blog'],
    'arxiv-cs-ai': ['arxiv cs.ai', 'arxiv.org'],
    'arxiv-cs-cl': ['arxiv cs.cl'],
    'arxiv-cs-lg': ['arxiv cs.lg'],
    'arxiv-stat-ml': ['arxiv stat.ml'],
    'techcrunch-ai': ['techcrunch', 'techcrunch.com'],
    'venturebeat-ai': ['venturebeat', 'venturebeat.com'],
    'the-verge-ai': ['the verge', 'theverge.com'],
    'mit-tech-review-ai': ['mit technology review', 'technologyreview.com'],
    'meta-ai-blog': ['meta ai', 'ai.meta.com'],
    'mistral-news': ['mistral', 'mistral.ai'],
    'nvidia-ai-blog': ['nvidia', 'blogs.nvidia.com'],
    'aws-machine-learning': ['aws machine learning', 'aws.amazon.com/blogs/machine-learning'],
    'stanford-hai': ['stanford hai', 'hai.stanford.edu'],
    'berkeley-bair': ['berkeley ai', 'bair.berkeley.edu'],
    'papers-with-code-blog': ['papers with code', 'paperswithcode.com'],
    'replicate-blog': ['replicate', 'replicate.com/blog'],
    'langchain-blog': ['langchain', 'blog.langchain.dev'],
    'llamaindex-blog': ['llamaindex', 'llamaindex.ai/blog']
  };

  const palette = {
    ocean: '#0b1412',
    oceanGrid: 'rgba(101, 217, 231, .1)',
    land: '#1e4639',
    landBright: '#2b5f4d',
    coast: 'rgba(132, 246, 202, .62)',
    source: '#65d9e7',
    sourceHalo: 'rgba(101, 217, 231, .22)',
    news: '#ff735f',
    newsHalo: 'rgba(255, 115, 95, .25)',
    disabled: '#64716c',
    disabledHalo: 'rgba(100, 113, 108, .16)',
    active: '#57f2b0',
    activeHalo: 'rgba(87, 242, 176, .3)'
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ZOOM_MIN = .74;
  const ZOOM_MAX = 1.5;
  const state = {
    sources: [],
    markers: [],
    newsBySource: new Map(),
    latestEdition: '',
    dragging: false,
    cardHover: false,
    manuallyPaused: reducedMotion.matches,
    activeSourceId: '',
    centerCoordinateLabel: '',
    zoomCurrent: 1,
    zoomTarget: 1,
    zoomVelocity: 0,
    zoomLabel: '1.00',
    pointer: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    lastFrame: performance.now(),
    ready: false
  };

  let renderer;
  let scene;
  let camera;
  let globeGroup;
  let markerGroup;
  let resizeObserver;
  let cameraBaseZ = 8.45;
  let zoomIdleTimer;

  function setFallback(message) {
    if (ui.fallback) {
      ui.fallback.textContent = message;
      ui.fallback.hidden = false;
    }
    canvas.hidden = true;
  }

  function escapeForMatch(value) {
    return String(value || '').trim().toLowerCase();
  }

  function flattenStories(content) {
    return Object.values(content?.sections || {}).flatMap((section) => section?.items || []).map((item) => ({
      title: String(item.title || '').trim(),
      source: String(item.source || '').trim(),
      url: String(item.url || '').trim(),
      publishedAt: item.published_at || item.publishedAt || item.date || content.date || ''
    })).filter((item) => item.title && /^https?:\/\//i.test(item.url));
  }

  function storyMatchesSource(story, source) {
    const aliases = SOURCE_ALIASES[source.id] || [source.source, source.display_name];
    const haystack = escapeForMatch([story.source, story.title, story.url].join(' '));
    return aliases.some((alias) => haystack.includes(escapeForMatch(alias)));
  }

  async function loadSignalData() {
    const [sourceResponse, landResponse, indexResponse] = await Promise.all([
      fetch('data/source-locations.json'),
      fetch('assets/globe/natural-earth-110m-land.geojson'),
      fetch('data/news-index.json')
    ]);

    if (!sourceResponse.ok) throw new Error(`source locations ${sourceResponse.status}`);
    if (!landResponse.ok) throw new Error(`Natural Earth ${landResponse.status}`);
    if (!indexResponse.ok) throw new Error(`news index ${indexResponse.status}`);

    const [sources, land, index] = await Promise.all([
      sourceResponse.json(),
      landResponse.json(),
      indexResponse.json()
    ]);

    const editionId = index.latest_edition_id || index.editions?.[0]?.edition_id || '';
    const edition = index.editions?.find((item) => item.edition_id === editionId) || index.editions?.[0] || {};
    const contentUrl = edition.content_url || `data/${editionId}/content.json`;
    const contentResponse = await fetch(contentUrl);
    if (!contentResponse.ok) throw new Error(`latest briefing ${contentResponse.status}`);
    const content = await contentResponse.json();
    const stories = flattenStories(content);
    const newsBySource = new Map();

    for (const source of sources) {
      const story = stories.find((item) => storyMatchesSource(item, source));
      if (story) newsBySource.set(source.id, story);
    }

    return { sources, land, editionId, newsBySource };
  }

  function latLngToVector3(lat, lng, distance) {
    const phi = THREE.MathUtils.degToRad(90 - Number(lat));
    const theta = THREE.MathUtils.degToRad(Number(lng) + 180);
    return new THREE.Vector3(
      -distance * Math.cos(theta) * Math.sin(phi),
      distance * Math.cos(phi),
      distance * Math.sin(theta) * Math.sin(phi)
    );
  }

  function vector3ToLatLng(vector) {
    const direction = vector.clone().normalize();
    const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)));
    let lng = THREE.MathUtils.radToDeg(Math.atan2(-direction.z, direction.x));
    if (lng > 180) lng -= 360;
    if (lng < -180) lng += 360;
    return { lat, lng };
  }

  function formatCoordinates(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '--';
    const latHemisphere = latitude >= 0 ? 'N' : 'S';
    const lngHemisphere = longitude >= 0 ? 'E' : 'W';
    return `${Math.abs(latitude).toFixed(3)}° ${latHemisphere} / ${Math.abs(longitude).toFixed(3)}° ${lngHemisphere}`;
  }

  function updateCenterCoordinates() {
    if (!globeGroup || !ui.centerCoordinates) return;
    const inverseRotation = globeGroup.quaternion.clone().invert();
    const centerDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(inverseRotation);
    const coordinates = vector3ToLatLng(centerDirection);
    const label = formatCoordinates(coordinates.lat, coordinates.lng);
    if (label === state.centerCoordinateLabel) return;
    state.centerCoordinateLabel = label;
    ui.centerCoordinates.textContent = label;
  }

  function drawMapTexture(geojson) {
    const width = 2048;
    const height = 1024;
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = width;
    textureCanvas.height = height;
    const context = textureCanvas.getContext('2d');

    context.fillStyle = palette.ocean;
    context.fillRect(0, 0, width, height);

    context.fillStyle = palette.oceanGrid;
    for (let y = 16; y < height; y += 24) {
      for (let x = 16; x < width; x += 24) context.fillRect(x, y, 1.2, 1.2);
    }

    context.lineJoin = 'round';
    context.lineCap = 'round';

    for (const feature of geojson.features || []) {
      const geometry = feature.geometry;
      if (!geometry) continue;
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates || [];

      for (const polygon of polygons) {
        for (const [ringIndex, ring] of polygon.entries()) {
          context.beginPath();
          let previousX = null;
          for (const [lng, lat] of ring) {
            const x = ((lng + 180) / 360) * width;
            const y = ((90 - lat) / 180) * height;
            if (previousX === null || Math.abs(x - previousX) > width * .45) context.moveTo(x, y);
            else context.lineTo(x, y);
            previousX = x;
          }
          context.closePath();

          if (ringIndex === 0) {
            context.fillStyle = palette.land;
            context.strokeStyle = palette.coast;
            context.lineWidth = 1.15;
            context.fill();
            context.stroke();
          } else {
            context.save();
            context.globalCompositeOperation = 'destination-out';
            context.fill();
            context.restore();
          }
        }
      }
    }

    context.globalAlpha = .2;
    context.fillStyle = palette.landBright;
    for (let y = 10; y < height; y += 18) {
      for (let x = 10; x < width; x += 18) context.fillRect(x, y, 1, 1);
    }
    context.globalAlpha = 1;

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;
    return texture;
  }

  function buildGlobeGrid(radius) {
    const group = new THREE.Group();
    const material = new THREE.LineBasicMaterial({
      color: 0x65d9e7,
      transparent: true,
      opacity: .1,
      depthWrite: false
    });

    function lineFromCoordinates(coordinates) {
      const geometry = new THREE.BufferGeometry().setFromPoints(
        coordinates.map(([lat, lng]) => latLngToVector3(lat, lng, radius * 1.005))
      );
      return new THREE.Line(geometry, material);
    }

    for (let lat = -60; lat <= 60; lat += 30) {
      group.add(lineFromCoordinates(Array.from({ length: 181 }, (_, index) => [lat, -180 + index * 2])));
    }
    for (let lng = -180; lng < 180; lng += 30) {
      group.add(lineFromCoordinates(Array.from({ length: 91 }, (_, index) => [-90 + index * 2, lng])));
    }
    return group;
  }

  function createAtmosphere(radius) {
    return new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.07, 96, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          glowColor: { value: new THREE.Color(0x57f2b0) }
        },
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 glowColor;
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.2);
            gl_FragColor = vec4(glowColor, intensity * 0.34);
          }
        `
      })
    );
  }

  function createMarkerTexture(status) {
    const size = 128;
    const markerCanvas = document.createElement('canvas');
    markerCanvas.width = size;
    markerCanvas.height = size;
    const context = markerCanvas.getContext('2d');
    const center = size / 2;
    const colors = status === 'news'
      ? { solid: palette.news, halo: palette.newsHalo }
      : status === 'disabled'
        ? { solid: palette.disabled, halo: palette.disabledHalo }
        : { solid: palette.source, halo: palette.sourceHalo };

    context.fillStyle = colors.halo;
    context.beginPath();
    context.arc(center, center, status === 'news' ? 39 : 33, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = colors.solid;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(center, center, status === 'news' ? 25 : 21, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = colors.solid;
    context.beginPath();
    context.arc(center, center, status === 'news' ? 11 : 8, 0, Math.PI * 2);
    context.fill();

    const texture = new THREE.CanvasTexture(markerCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function buildMarkers(radius) {
    const textures = {
      source: createMarkerTexture('source'),
      news: createMarkerTexture('news'),
      disabled: createMarkerTexture('disabled')
    };
    markerGroup.clear();
    state.markers = [];

    for (const source of state.sources) {
      const news = state.newsBySource.get(source.id) || null;
      const status = news ? 'news' : source.enabled ? 'source' : 'disabled';
      const material = new THREE.SpriteMaterial({
        map: textures[status],
        transparent: true,
        depthTest: true,
        depthWrite: false,
        opacity: source.enabled || news ? 1 : .58
      });
      const marker = new THREE.Sprite(material);
      const lat = Number.isFinite(source.display_lat) ? source.display_lat : source.lat;
      const lng = Number.isFinite(source.display_lng) ? source.display_lng : source.lng;
      const baseScale = status === 'news' ? .25 : status === 'disabled' ? .16 : .19;
      marker.position.copy(latLngToVector3(lat, lng, radius * 1.045));
      marker.scale.setScalar(baseScale);
      marker.userData = { source, news, status, baseScale };
      markerGroup.add(marker);
      state.markers.push(marker);
    }
  }

  function buildScene(geojson) {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x0a100e, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
    camera.position.set(0, 0, cameraBaseZ);

    scene.add(new THREE.HemisphereLight(0xb5fff0, 0x06100c, 1.65));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(-3.5, 4.5, 5.5);
    scene.add(keyLight);
    const edgeLight = new THREE.PointLight(0xff735f, 12, 12, 2);
    edgeLight.position.set(3.8, -2.4, 3.2);
    scene.add(edgeLight);

    const radius = 2.2;
    globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 128, 96),
      new THREE.MeshStandardMaterial({
        map: drawMapTexture(geojson),
        color: 0xffffff,
        roughness: .86,
        metalness: .12
      })
    );
    globeGroup.add(globe);
    globeGroup.add(buildGlobeGrid(radius));
    globeGroup.add(createAtmosphere(radius));

    markerGroup = new THREE.Group();
    globeGroup.add(markerGroup);
    buildMarkers(radius);
  }

  function updateStats() {
    if (ui.total) ui.total.textContent = String(state.sources.length);
    if (ui.hot) ui.hot.textContent = String(state.newsBySource.size);
    if (ui.edition) ui.edition.textContent = state.latestEdition || '待更新';
  }

  function formattedPublishedTime(value) {
    const text = String(value || '').trim();
    if (!text) return state.latestEdition;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime()) && /T|\d{2}:\d{2}/.test(text)) {
      return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Taipei'
      }).format(parsed);
    }
    return text;
  }

  function resetCardTilt() {
    if (ui.card) ui.card.style.transform = '';
  }

  function setActiveSource(sourceId) {
    if (state.activeSourceId === sourceId) return;
    state.activeSourceId = sourceId;
    stage.dataset.activeSource = sourceId;
    const marker = state.markers.find((item) => item.userData.source.id === sourceId);

    if (!marker) {
      if (ui.readout) ui.readout.hidden = true;
      if (ui.card) ui.card.hidden = true;
      resetCardTilt();
      return;
    }

    const { source, news } = marker.userData;
    if (ui.readout) ui.readout.hidden = false;
    if (ui.source) ui.source.textContent = source.display_name || source.source;
    if (ui.location) ui.location.textContent = [source.city, source.country].filter(Boolean).join(' · ');
    if (ui.sourceCoordinates) ui.sourceCoordinates.textContent = formatCoordinates(source.lat, source.lng);

    if (!news || !ui.card) {
      if (ui.card) ui.card.hidden = true;
      resetCardTilt();
      return;
    }

    ui.card.href = news.url;
    ui.card.hidden = false;
    if (ui.cardSource) ui.cardSource.textContent = news.source || source.display_name || source.source;
    if (ui.cardTime) ui.cardTime.textContent = formattedPublishedTime(news.publishedAt);
    if (ui.cardTitle) ui.cardTitle.textContent = news.title;
  }

  function closestCenteredMarker() {
    if (!state.markers.length || state.cardHover) return null;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const candidates = [];

    for (const marker of state.markers) {
      const world = marker.getWorldPosition(new THREE.Vector3());
      const frontFacing = world.z > .22;
      if (!frontFacing) continue;
      const projected = world.clone().project(camera);
      const distance = Math.hypot(projected.x, projected.y);
      if (distance < .32) candidates.push({ marker, distance });
    }
    const pool = candidates.some((item) => item.marker.userData.news)
      ? candidates.filter((item) => item.marker.userData.news)
      : candidates;
    pool.sort((a, b) => a.distance - b.distance);
    return pool[0]?.marker || null;
  }

  function updateMarkerPresentation(time) {
    const centered = closestCenteredMarker();
    if (!state.cardHover) setActiveSource(centered?.userData.source.id || '');

    for (const marker of state.markers) {
      const active = marker.userData.source.id === state.activeSourceId;
      const pulse = marker.userData.status === 'news' && !reducedMotion.matches
        ? 1 + Math.sin(time * .004) * .09
        : 1;
      const targetScale = marker.userData.baseScale * pulse * (active ? 1.55 : 1);
      const nextScale = THREE.MathUtils.lerp(marker.scale.x, targetScale, active ? .16 : .1);
      marker.scale.setScalar(nextScale);
      marker.material.opacity = active ? 1 : marker.userData.status === 'disabled' ? .52 : .9;
    }
  }

  function focusInitialNewsSource() {
    const source = state.sources.find((item) => state.newsBySource.has(item.id)) || state.sources.find((item) => item.enabled);
    if (!source) return null;
    const lat = Number.isFinite(source.display_lat) ? source.display_lat : source.lat;
    const lng = Number.isFinite(source.display_lng) ? source.display_lng : source.lng;
    const localDirection = latLngToVector3(lat, lng, 1).normalize();
    globeGroup.quaternion.setFromUnitVectors(localDirection, new THREE.Vector3(0, 0, 1));
    globeGroup.updateMatrixWorld(true);
    return source;
  }

  function resize() {
    if (!renderer || !camera) return;
    const bounds = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    cameraBaseZ = 8.45 * Math.max(1, 1 / camera.aspect);
    if (width < 540) cameraBaseZ += .12;
    camera.position.z = cameraBaseZ / state.zoomCurrent;
    camera.updateProjectionMatrix();
  }

  function updateZoom(delta) {
    const frameScale = Math.min(2.4, Math.max(.25, delta / 16.667));

    if (reducedMotion.matches) {
      state.zoomCurrent = state.zoomTarget;
      state.zoomVelocity = 0;
    } else {
      state.zoomVelocity += (state.zoomTarget - state.zoomCurrent) * .12 * frameScale;
      state.zoomVelocity *= Math.pow(.74, frameScale);
      state.zoomVelocity = THREE.MathUtils.clamp(state.zoomVelocity, -.075, .075);
      state.zoomCurrent += state.zoomVelocity * frameScale;

      if (Math.abs(state.zoomTarget - state.zoomCurrent) < .0004 && Math.abs(state.zoomVelocity) < .0004) {
        state.zoomCurrent = state.zoomTarget;
        state.zoomVelocity = 0;
      }
    }

    camera.position.z = cameraBaseZ / state.zoomCurrent;
    const zoomLabel = state.zoomCurrent.toFixed(2);
    if (zoomLabel !== state.zoomLabel) {
      state.zoomLabel = zoomLabel;
      stage.dataset.zoom = zoomLabel;
    }
  }

  function frame(time) {
    if (!state.ready) return;
    const delta = Math.min(42, time - state.lastFrame || 16);
    state.lastFrame = time;
    const paused = state.manuallyPaused || state.cardHover || reducedMotion.matches;

    if (!state.dragging && !paused) {
      globeGroup.rotateY(delta * .000018 + state.velocity.x);
      globeGroup.rotateX(state.velocity.y);
      const rotationDamping = Math.pow(.952, delta / 16.667);
      state.velocity.x *= rotationDamping;
      state.velocity.y *= rotationDamping;
    }

    updateZoom(delta);
    updateCenterCoordinates();
    updateMarkerPresentation(time);
    renderer.render(scene, camera);
    window.requestAnimationFrame(frame);
  }

  function updateMotionButton() {
    if (!ui.motion || !ui.motionIcon) return;
    const paused = state.manuallyPaused;
    ui.motionIcon.textContent = paused ? '▶' : 'Ⅱ';
    ui.motion.setAttribute('aria-label', paused ? '恢复地球自转' : '暂停地球自转');
    ui.motion.title = paused ? '恢复地球自转' : '暂停地球自转';
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    state.dragging = true;
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
    state.velocity.x = 0;
    state.velocity.y = 0;
    stage.classList.add('is-dragging');
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!state.dragging || !globeGroup) return;
    const dx = event.clientX - state.pointer.x;
    const dy = event.clientY - state.pointer.y;
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
    const horizontal = dx * .0052;
    const vertical = dy * .0038;
    globeGroup.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), horizontal);
    globeGroup.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), vertical);
    state.velocity.x = horizontal * .08;
    state.velocity.y = vertical * .06;
  }

  function onPointerUp(event) {
    state.dragging = false;
    stage.classList.remove('is-dragging');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  function onWheel(event) {
    if (!state.ready || event.target.closest('a, button')) return;
    const modeScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? stage.clientHeight
        : 1;
    const delta = THREE.MathUtils.clamp(event.deltaY * modeScale, -180, 180);
    const nextTarget = THREE.MathUtils.clamp(
      state.zoomTarget * Math.exp(-delta * .0012),
      ZOOM_MIN,
      ZOOM_MAX
    );

    if (Math.abs(nextTarget - state.zoomTarget) < .0001) return;
    event.preventDefault();
    state.zoomTarget = nextTarget;
    state.zoomVelocity += (state.zoomTarget - state.zoomCurrent) * .025;
    stage.classList.add('is-zooming');
    window.clearTimeout(zoomIdleTimer);
    zoomIdleTimer = window.setTimeout(() => stage.classList.remove('is-zooming'), 220);
  }

  function bindEvents() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    stage.addEventListener('wheel', onWheel, { passive: false });

    ui.motion?.addEventListener('click', () => {
      state.manuallyPaused = !state.manuallyPaused;
      updateMotionButton();
    });

    ui.card?.addEventListener('pointerenter', () => {
      state.cardHover = true;
    });
    ui.card?.addEventListener('pointermove', (event) => {
      const bounds = ui.card.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - .5;
      const y = (event.clientY - bounds.top) / bounds.height - .5;
      ui.card.style.transform = `perspective(760px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) scale(1.025)`;
    });
    ui.card?.addEventListener('pointerleave', () => {
      state.cardHover = false;
      resetCardTilt();
    });

    window.addEventListener('keydown', (event) => {
      if (!globeGroup || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      if (!stage.matches(':hover') && document.activeElement !== ui.motion && document.activeElement !== ui.card) return;
      event.preventDefault();
      const amount = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -.08 : .08;
      const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
      globeGroup.rotateOnWorldAxis(axis, amount);
    });

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
  }

  async function init() {
    try {
      const data = await loadSignalData();
      state.sources = data.sources;
      state.newsBySource = data.newsBySource;
      state.latestEdition = data.editionId;
      buildScene(data.land);
      const initialSource = focusInitialNewsSource();
      updateStats();
      updateMotionButton();
      stage.dataset.zoom = state.zoomLabel;
      bindEvents();
      resize();
      state.ready = true;
      setActiveSource(initialSource?.id || '');
      state.lastFrame = performance.now();
      window.requestAnimationFrame(frame);
    } catch (error) {
      console.error('Signal globe failed to initialize', error);
      setFallback('全球信号图暂时不可用，今日晨报仍可正常阅读。');
    }
  }

  init();
}
