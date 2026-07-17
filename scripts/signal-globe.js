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
    centerTarget: stage.querySelector('[data-signal-center-target]'),
    centerCoordinates: stage.querySelector('[data-signal-center-coordinates]'),
    readout: stage.querySelector('[data-signal-readout]'),
    source: stage.querySelector('[data-signal-source]'),
    location: stage.querySelector('[data-signal-location]'),
    sourceCoordinates: stage.querySelector('[data-signal-source-coordinates]'),
    connectorLayer: stage.querySelector('[data-signal-connectors]'),
    storyLayer: stage.querySelector('[data-signal-story-layer]'),
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

  const SOURCE_LOGOS = {
    'openai-news': 'openai',
    'anthropic-news': 'anthropic',
    'google-ai-blog': 'google',
    'google-research-blog': 'google',
    'google-deepmind-blog': 'googledeepmind',
    'microsoft-ai-blog': 'microsoft',
    'microsoft-research-ai': 'microsoft',
    'github-blog': 'github',
    'huggingface-blog': 'huggingface',
    'arxiv-cs-ai': 'arxiv',
    'arxiv-cs-cl': 'arxiv',
    'arxiv-cs-lg': 'arxiv',
    'arxiv-stat-ml': 'arxiv',
    'techcrunch-ai': 'techcrunch',
    'venturebeat-ai': 'venturebeat',
    'the-verge-ai': 'theverge',
    'mit-tech-review-ai': 'mit',
    'meta-ai-blog': 'meta',
    'mistral-news': 'mistralai',
    'nvidia-ai-blog': 'nvidia',
    'aws-machine-learning': 'amazonwebservices',
    'stanford-hai': 'stanforduniversity',
    'berkeley-bair': 'universityofcaliforniaberkeley',
    'papers-with-code-blog': 'paperswithcode',
    'replicate-blog': 'replicate',
    'langchain-blog': 'langchain',
    'llamaindex-blog': 'llamaindex'
  };

  const palette = {
    ocean: '#07110f',
    oceanDeep: '#030907',
    oceanLight: '#102b25',
    land: '#1b3a32',
    landBright: '#31574c',
    coast: 'rgba(143, 222, 194, .5)',
    quiet: '#8e9994',
    quietHalo: 'rgba(142, 153, 148, .18)',
    news: '#ff735f',
    newsHalo: 'rgba(255, 115, 95, .25)',
    disabled: '#64716c',
    disabledHalo: 'rgba(100, 113, 108, .16)',
    active: '#57f2b0',
    activeHalo: 'rgba(87, 242, 176, .3)'
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const ZOOM_MIN = .74;
  const ZOOM_MAX = 1.5;
  const DRAG_HORIZONTAL = .0058;
  const DRAG_VERTICAL = .00415;
  const state = {
    sources: [],
    markers: [],
    newsBySource: new Map(),
    latestEdition: '',
    dragging: false,
    cardHover: false,
    hoveredStoryId: '',
    manuallyPaused: false,
    activeSourceId: '',
    storyCards: new Map(),
    centerCoordinateLabel: '',
    globeTargetNdc: { x: .36, y: -.13 },
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
    return Object.entries(content?.sections || {}).flatMap(([sectionId, section]) => (
      (section?.items || []).map((item) => ({
        title: String(item.title || '').trim(),
        body: String(item.body || item.summary || '').trim(),
        janetTake: String(item.janet_take || item.janetTake || '').trim(),
        source: String(item.source || '').trim(),
        url: String(item.url || '').trim(),
        sectionId,
        publishedAt: item.published_at || item.publishedAt || item.date || content.date || ''
      }))
    )).filter((item) => item.title && /^https?:\/\//i.test(item.url));
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

    const ocean = context.createLinearGradient(0, 0, width, height);
    ocean.addColorStop(0, palette.oceanLight);
    ocean.addColorStop(.42, palette.ocean);
    ocean.addColorStop(1, palette.oceanDeep);
    context.fillStyle = ocean;
    context.fillRect(0, 0, width, height);

    const land = context.createLinearGradient(0, 0, 0, height);
    land.addColorStop(0, palette.landBright);
    land.addColorStop(1, palette.land);

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
            context.fillStyle = land;
            context.strokeStyle = palette.coast;
            context.lineWidth = .9;
            context.fill();
            context.stroke();
          } else {
            context.fillStyle = ocean;
            context.fill();
          }
        }
      }
    }

    const vignette = context.createRadialGradient(width * .34, height * .32, 20, width * .5, height * .5, width * .74);
    vignette.addColorStop(0, 'rgba(255,255,255,.08)');
    vignette.addColorStop(.58, 'rgba(255,255,255,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.22)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;
    return texture;
  }

  function buildGlobeGrid(radius) {
    const group = new THREE.Group();
    const material = new THREE.LineBasicMaterial({
      color: 0x9ddac9,
      transparent: true,
      opacity: .026,
      depthWrite: false
    });

    function lineFromCoordinates(coordinates) {
      const geometry = new THREE.BufferGeometry().setFromPoints(
        coordinates.map(([lat, lng]) => latLngToVector3(lat, lng, radius * 1.005))
      );
      return new THREE.Line(geometry, material);
    }

    for (let lat = -60; lat <= 60; lat += 60) {
      group.add(lineFromCoordinates(Array.from({ length: 181 }, (_, index) => [lat, -180 + index * 2])));
    }
    for (let lng = -180; lng < 180; lng += 60) {
      group.add(lineFromCoordinates(Array.from({ length: 91 }, (_, index) => [-90 + index * 2, lng])));
    }
    return group;
  }

  function createAtmosphere(radius) {
    return new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.018, 96, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          glowColor: { value: new THREE.Color(0x9ddac9) }
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
            float fresnel = clamp(0.5 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
            float intensity = pow(fresnel, 3.8);
            gl_FragColor = vec4(glowColor, intensity * 0.13);
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
        : { solid: palette.quiet, halo: palette.quietHalo };

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
      quiet: createMarkerTexture('quiet'),
      news: createMarkerTexture('news'),
      disabled: createMarkerTexture('disabled')
    };
    markerGroup.clear();
    state.markers = [];

    for (const source of state.sources) {
      const news = state.newsBySource.get(source.id) || null;
      const status = news ? 'news' : source.enabled ? 'quiet' : 'disabled';
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
      const baseScale = status === 'news' ? .25 : status === 'disabled' ? .14 : .17;
      marker.position.copy(latLngToVector3(lat, lng, radius * 1.045));
      marker.scale.setScalar(baseScale);
      marker.userData = { source, news, status, baseScale };
      markerGroup.add(marker);
      state.markers.push(marker);
    }
  }

  function appendTextElement(parent, tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function resetStoryTilt(entry) {
    if (!entry?.element) return;
    entry.element.style.setProperty('--story-tilt-x', '0deg');
    entry.element.style.setProperty('--story-tilt-y', '0deg');
  }

  function bindStoryCard(entry) {
    const { element, source } = entry;
    if (!finePointer.matches) return;
    element.addEventListener('pointerenter', () => {
      state.cardHover = true;
      state.hoveredStoryId = source.id;
      element.classList.add('is-hovered');
      entry.connector?.classList.add('is-hovered');
    });
    element.addEventListener('pointermove', (event) => {
      const bounds = element.getBoundingClientRect();
      const x = THREE.MathUtils.clamp((event.clientX - bounds.left) / bounds.width - .5, -.5, .5);
      const y = THREE.MathUtils.clamp((event.clientY - bounds.top) / bounds.height - .5, -.5, .5);
      element.style.setProperty('--story-tilt-x', `${(-y * 5).toFixed(2)}deg`);
      element.style.setProperty('--story-tilt-y', `${(x * 6).toFixed(2)}deg`);
    });
    element.addEventListener('pointerleave', () => {
      state.cardHover = false;
      state.hoveredStoryId = '';
      element.classList.remove('is-hovered');
      entry.connector?.classList.remove('is-hovered');
      resetStoryTilt(entry);
    });
  }

  function buildStoryCards() {
    if (!ui.storyLayer) return;
    ui.storyLayer.replaceChildren();
    ui.connectorLayer?.replaceChildren();
    state.storyCards.clear();

    for (const marker of state.markers) {
      const { source, news } = marker.userData;
      if (!news) continue;

      const card = document.createElement('a');
      card.className = 'signal-story-card';
      card.href = news.url;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.dataset.sourceId = source.id;
      card.setAttribute('aria-label', `查看新闻：${news.title}`);
      card.setAttribute('aria-hidden', 'true');
      card.tabIndex = -1;

      const logo = document.createElement('span');
      logo.className = 'signal-story-logo';
      logo.setAttribute('aria-hidden', 'true');
      const logoFallback = document.createElement('span');
      logoFallback.className = 'signal-story-logo-fallback';
      logoFallback.textContent = source.display_name || source.source;
      logo.appendChild(logoFallback);
      const logoSlug = SOURCE_LOGOS[source.id];
      if (logoSlug) {
        const logoImage = document.createElement('img');
        logoImage.src = `https://cdn.jsdelivr.net/npm/simple-icons@v16/icons/${logoSlug}.svg`;
        logoImage.alt = '';
        logoImage.decoding = 'async';
        logoImage.addEventListener('load', () => logo.classList.add('has-image'), { once: true });
        logo.prepend(logoImage);
      }
      card.appendChild(logo);

      const connector = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      connector.classList.add('signal-story-leader');
      connector.dataset.sourceId = source.id;
      ui.connectorLayer?.appendChild(connector);

      const meta = document.createElement('span');
      meta.className = 'signal-story-meta';
      appendTextElement(meta, 'span', 'signal-story-source', news.source || source.display_name || source.source);
      const time = appendTextElement(meta, 'time', '', formattedPublishedTime(news.publishedAt));
      time.dateTime = String(news.publishedAt || state.latestEdition);
      card.appendChild(meta);

      const titleElement = appendTextElement(card, 'strong', 'signal-story-title', news.title);
      const titleLength = Array.from(String(news.title || '')).length;
      if (titleLength > 56) card.classList.add('is-title-xlong');
      else if (titleLength > 34) card.classList.add('is-title-long');
      titleElement.title = news.title;

      const detail = document.createElement('span');
      detail.className = 'signal-story-detail';
      if (news.body) appendTextElement(detail, 'span', 'signal-story-body', news.body);
      if (news.janetTake) {
        const take = document.createElement('span');
        take.className = 'signal-story-take';
        appendTextElement(take, 'b', '', 'Janet 锐评');
        appendTextElement(take, 'span', '', news.janetTake);
        detail.appendChild(take);
      }
      const action = appendTextElement(detail, 'span', 'signal-story-action', '进入原文');
      action.setAttribute('aria-hidden', 'true');
      card.appendChild(detail);

      const entry = {
        element: card,
        marker,
        source,
        story: news,
        connector,
        x: 0,
        y: 0,
        markerX: 0,
        markerY: 0,
        opacity: 0,
        scale: .72,
        targetX: 0,
        targetY: 0,
        targetOpacity: 0,
        targetScale: .72,
        width: 250,
        height: 104,
        initialized: false
      };
      bindStoryCard(entry);
      ui.storyLayer.appendChild(card);
      state.storyCards.set(source.id, entry);
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

    scene.add(new THREE.AmbientLight(0x87b7a5, .72));
    scene.add(new THREE.HemisphereLight(0xc9eee3, 0x020605, 1.28));
    const keyLight = new THREE.DirectionalLight(0xeaf8f3, 1.82);
    keyLight.position.set(-4.2, 5.2, 6.5);
    scene.add(keyLight);
    const edgeLight = new THREE.PointLight(0xf07865, 6.4, 12, 2);
    edgeLight.position.set(3.8, -2.4, 3.2);
    scene.add(edgeLight);

    const radius = 2.2;
    globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 128, 96),
      new THREE.MeshPhysicalMaterial({
        map: drawMapTexture(geojson),
        color: 0xffffff,
        roughness: .7,
        metalness: .025,
        clearcoat: .34,
        clearcoatRoughness: .72
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

  function setActiveSource(sourceId) {
    if (state.activeSourceId === sourceId) return;
    state.activeSourceId = sourceId;
    stage.dataset.activeSource = sourceId;
    const marker = state.markers.find((item) => item.userData.source.id === sourceId);
    stage.dataset.activeKind = marker?.userData.news ? 'news' : marker ? 'quiet' : '';

    for (const [storySourceId, entry] of state.storyCards) {
      const active = storySourceId === sourceId;
      entry.element.classList.toggle('is-active', active);
      entry.connector?.classList.toggle('is-active', active);
      if (!active && storySourceId !== state.hoveredStoryId) resetStoryTilt(entry);
    }

    if (!marker) {
      if (ui.readout) ui.readout.hidden = true;
      return;
    }

    const { source, news } = marker.userData;
    if (ui.readout) ui.readout.hidden = Boolean(news);
    if (ui.source) ui.source.textContent = source.display_name || source.source;
    if (ui.location) ui.location.textContent = [source.city, source.country].filter(Boolean).join(' · ');
    if (ui.sourceCoordinates) ui.sourceCoordinates.textContent = formatCoordinates(source.lat, source.lng);
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
      const distance = Math.hypot(
        projected.x - state.globeTargetNdc.x,
        projected.y - state.globeTargetNdc.y
      );
      if (distance < .27) candidates.push({ marker, distance });
    }
    const pool = candidates.some((item) => item.marker.userData.news)
      ? candidates.filter((item) => item.marker.userData.news)
      : candidates;
    pool.sort((a, b) => a.distance - b.distance);
    return pool[0]?.marker || null;
  }

  function clamp01(value) {
    return THREE.MathUtils.clamp(value, 0, 1);
  }

  function resolveStoryLane(entries, topLimit, bottomLimit, gap = 14, centerY = 0) {
    const availableHeight = Math.max(0, bottomLimit - topLimit);
    entries.sort((a, b) => Math.abs(a.markerY - centerY) - Math.abs(b.markerY - centerY));

    let occupiedHeight = 0;
    const visibleEntries = [];
    for (const entry of entries) {
      const requiredHeight = entry.height + (visibleEntries.length ? gap : 0);
      if (occupiedHeight + requiredHeight <= availableHeight) {
        visibleEntries.push(entry);
        occupiedHeight += requiredHeight;
      } else {
        entry.targetOpacity = 0;
      }
    }

    entries.splice(0, entries.length, ...visibleEntries);
    entries.sort((a, b) => a.targetY - b.targetY);
    let cursor = topLimit;

    for (const entry of entries) {
      entry.targetY = Math.max(entry.targetY, cursor);
      cursor = entry.targetY + entry.height + gap;
    }

    cursor = bottomLimit;
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      entry.targetY = Math.min(entry.targetY, cursor - entry.height);
      cursor = entry.targetY - gap;
    }

    cursor = topLimit;
    for (const entry of entries) {
      entry.targetY = Math.max(entry.targetY, cursor);
      cursor = entry.targetY + entry.height + gap;
    }
  }

  function updateStoryConnector(entry, visible) {
    if (!entry.connector) return;
    const active = entry.source.id === state.activeSourceId;
    const anchorX = active
      ? entry.x + entry.width * .5
      : entry.side === 'left' ? entry.x + entry.width : entry.x;
    const anchorY = active ? entry.y : entry.y + entry.height * .5;
    const dx = anchorX - entry.markerX;
    const direction = Math.sign(dx) || 1;
    const path = active
      ? `M ${entry.markerX.toFixed(2)} ${entry.markerY.toFixed(2)} C ${entry.markerX.toFixed(2)} ${(entry.markerY + 30).toFixed(2)}, ${anchorX.toFixed(2)} ${(anchorY - 38).toFixed(2)}, ${anchorX.toFixed(2)} ${anchorY.toFixed(2)}`
      : `M ${entry.markerX.toFixed(2)} ${entry.markerY.toFixed(2)} C ${(entry.markerX + dx * .38).toFixed(2)} ${entry.markerY.toFixed(2)}, ${(anchorX - direction * 34).toFixed(2)} ${anchorY.toFixed(2)}, ${anchorX.toFixed(2)} ${anchorY.toFixed(2)}`;
    entry.connector.setAttribute('d', path);
    entry.connector.classList.toggle('is-visible', visible);
    entry.connector.style.setProperty('--leader-opacity', (entry.opacity * (active ? .92 : .66)).toFixed(3));
  }

  function updateStoryCardTargets() {
    if (!state.storyCards.size) return;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);

    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    const mobile = width < 620;
    const narrowTablet = width < 861;
    const compactViewport = width < 1081;
    const compactWidth = mobile ? 0 : narrowTablet ? 220 : compactViewport ? 190 : 250;
    const compactHeight = mobile ? 0 : narrowTablet ? 84 : compactViewport ? 78 : 104;
    const expandedWidth = Math.min(mobile ? 296 : narrowTablet ? 380 : compactViewport ? 360 : 410, width - (mobile ? 52 : 24));
    const expandedHeight = mobile ? 82 : narrowTablet ? 220 : compactViewport ? 210 : 252;
    const stageBounds = stage.getBoundingClientRect();
    const toolbarBounds = stage.querySelector('.signal-globe-toolbar')?.getBoundingClientRect();
    const statsBounds = document.querySelector('.signal-hero-stats')?.getBoundingClientRect();
    const copyBounds = document.querySelector('.signal-hero-copy')?.getBoundingClientRect();
    let topLimit = mobile ? Math.max(380, height * .58) : 150;
    let bottomLimit = height - (mobile ? 88 : 72);
    if (statsBounds) bottomLimit = Math.min(bottomLimit, statsBounds.top - stageBounds.top - 8);
    if (compactViewport) {
      if (toolbarBounds) topLimit = Math.max(topLimit, toolbarBounds.bottom - stageBounds.top + 8);
      if (statsBounds) bottomLimit = Math.min(bottomLimit, statsBounds.top - stageBounds.top - (mobile ? 4 : 8));
    }
    const copySafeLeft = copyBounds ? copyBounds.right - stageBounds.left + 24 : 0;
    const safeLeft = narrowTablet ? 12 : Math.max(12, width * .43, copySafeLeft);
    const centerX = (state.globeTargetNdc.x * .5 + .5) * width;
    const centerY = (-state.globeTargetNdc.y * .5 + .5) * height;
    const centerSafeX = mobile ? 74 : compactViewport ? 92 : 118;
    const lanes = { left: [], right: [] };
    let activeEntry = null;
    const focusedStory = state.storyCards.has(state.activeSourceId);

    for (const entry of state.storyCards.values()) {
      const world = entry.marker.getWorldPosition(new THREE.Vector3());
      const projected = world.clone().project(camera);
      const frontFacing = world.z > .16 && projected.z < 1;
      const inFrame = Math.abs(projected.x) < 1.08 && Math.abs(projected.y) < 1.04;
      const active = entry.source.id === state.activeSourceId;
      const markerX = (projected.x * .5 + .5) * width;
      const markerY = (-projected.y * .5 + .5) * height;
      entry.markerX = markerX;
      entry.markerY = markerY;
      const edgeFade = Math.min(
        clamp01((1.08 - Math.abs(projected.x)) / .2),
        clamp01((1.04 - Math.abs(projected.y)) / .18)
      );

      entry.width = active ? expandedWidth : compactWidth;
      entry.height = active ? expandedHeight : compactHeight;
      entry.targetOpacity = frontFacing && inFrame
        ? active ? .98 : mobile || focusedStory ? 0 : .62 + edgeFade * .34
        : 0;
      entry.targetScale = active ? 1 : frontFacing && inFrame ? .92 + edgeFade * .08 : .72;

      if (!frontFacing || !inFrame) continue;

      if (active) {
        activeEntry = entry;
        const activeMinX = narrowTablet ? 12 : Math.min(safeLeft, width - entry.width - 12);
        entry.targetX = mobile
          ? (width - entry.width) * .5
          : THREE.MathUtils.clamp(centerX - entry.width * .5, activeMinX, width - entry.width - 12);
        const activeY = mobile ? centerY + 72 : centerY - entry.height - 68;
        entry.targetY = THREE.MathUtils.clamp(activeY, topLimit, bottomLimit - entry.height);
        entry.side = 'active';
        entry.element.classList.remove('is-left');
        continue;
      }

      if (mobile) continue;

      const leftMaxX = centerX - centerSafeX - entry.width;
      const rightMinX = centerX + centerSafeX;
      const canUseLeft = leftMaxX >= safeLeft;
      const canUseRight = rightMinX + entry.width <= width - 12;
      let lane;
      if (compactViewport) {
        lane = canUseRight ? 'right' : 'left';
      } else {
        const preferredLane = markerX < centerX ? 'left' : 'right';
        const alternateLane = preferredLane === 'left' ? 'right' : 'left';
        const preferredAvailable = preferredLane === 'left' ? canUseLeft : canUseRight;
        const alternateAvailable = alternateLane === 'left' ? canUseLeft : canUseRight;
        lane = preferredAvailable ? preferredLane : alternateAvailable ? alternateLane : preferredLane;
        if (lanes[lane].length > lanes[alternateLane].length + 1 && alternateAvailable) lane = alternateLane;
      }
      let proposedX = mobile
        ? lane === 'left' ? 12 : width - entry.width - 12
        : lane === 'left' ? markerX - entry.width - 18 : markerX + 18;
      if (!mobile) {
        proposedX = lane === 'left'
          ? Math.min(proposedX, leftMaxX)
          : Math.max(proposedX, rightMinX);
      }
      entry.targetX = THREE.MathUtils.clamp(proposedX, safeLeft, width - entry.width - 12);
      entry.targetY = THREE.MathUtils.clamp(markerY - entry.height * .5, topLimit, bottomLimit - entry.height);
      entry.side = lane;
      entry.element.classList.toggle('is-left', lane === 'left');
      lanes[lane].push(entry);
    }

    if (compactViewport && !mobile) {
      for (const lane of [lanes.left, lanes.right]) {
        lane.sort((a, b) => Math.abs(a.markerY - centerY) - Math.abs(b.markerY - centerY));
        const visibleLimit = focusedStory ? 0 : 2;
        lane.slice(visibleLimit).forEach((entry) => { entry.targetOpacity = 0; });
        lane.splice(visibleLimit);
      }
    }

    if (activeEntry) {
      for (const lane of [lanes.left, lanes.right]) {
        lane.forEach((entry) => { entry.targetOpacity = 0; });
        lane.splice(0);
      }
    } else {
      resolveStoryLane(lanes.left, topLimit, bottomLimit, compactViewport ? 12 : 16, centerY);
      resolveStoryLane(lanes.right, topLimit, bottomLimit, compactViewport ? 12 : 16, centerY);
    }
  }

  function animateStoryCards(delta) {
    const frameScale = Math.min(2.4, Math.max(.25, delta / 16.667));
    const positionEase = reducedMotion.matches ? 1 : 1 - Math.pow(.78, frameScale);
    const opacityEase = reducedMotion.matches ? 1 : 1 - Math.pow(.7, frameScale);

    for (const entry of state.storyCards.values()) {
      if (!entry.initialized && entry.targetOpacity > .02) {
        entry.x = entry.targetX;
        entry.y = entry.targetY + 14;
        entry.initialized = true;
      }
      entry.x = THREE.MathUtils.lerp(entry.x, entry.targetX, positionEase);
      entry.y = THREE.MathUtils.lerp(entry.y, entry.targetY, positionEase);
      entry.opacity = THREE.MathUtils.lerp(entry.opacity, entry.targetOpacity, opacityEase);
      entry.scale = THREE.MathUtils.lerp(entry.scale, entry.targetScale, positionEase);

      const visible = entry.opacity > .08;
      entry.element.classList.toggle('is-visible', visible);
      entry.element.setAttribute('aria-hidden', String(!visible));
      entry.element.tabIndex = visible ? 0 : -1;
      entry.element.style.setProperty('--story-x', `${entry.x.toFixed(2)}px`);
      entry.element.style.setProperty('--story-y', `${entry.y.toFixed(2)}px`);
      entry.element.style.setProperty('--story-opacity', entry.opacity.toFixed(3));
      entry.element.style.setProperty('--story-scale', entry.scale.toFixed(3));
      updateStoryConnector(entry, visible);
    }
  }

  function updateMarkerPresentation(time, delta) {
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
      marker.material.opacity = active
        ? 1
        : marker.userData.status === 'news'
          ? .94
          : marker.userData.status === 'disabled'
            ? .38
            : .64;
    }

    updateStoryCardTargets();
    animateStoryCards(delta);
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

  function updateGlobePlacement() {
    if (!camera || !globeGroup) return;
    const verticalHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov * .5)) * camera.position.z;
    const horizontalHalf = verticalHalf * camera.aspect;
    globeGroup.position.x = state.globeTargetNdc.x * horizontalHalf;
    globeGroup.position.y = state.globeTargetNdc.y * verticalHalf;
    globeGroup.position.z = 0;

    const center = globeGroup.getWorldPosition(new THREE.Vector3()).project(camera);
    const centerX = (center.x * .5 + .5) * stage.clientWidth;
    const centerY = (-center.y * .5 + .5) * stage.clientHeight;
    stage.style.setProperty('--signal-center-x', `${centerX.toFixed(2)}px`);
    stage.style.setProperty('--signal-center-y', `${centerY.toFixed(2)}px`);
  }

  function resize() {
    if (!renderer || !camera) return;
    const bounds = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    renderer.setSize(width, height, false);
    if (ui.connectorLayer) {
      ui.connectorLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
      ui.connectorLayer.setAttribute('preserveAspectRatio', 'none');
    }
    camera.aspect = width / height;
    if (width < 560) {
      cameraBaseZ = 13.2;
      state.globeTargetNdc.x = .08;
      state.globeTargetNdc.y = -.24;
    } else if (width < 860) {
      cameraBaseZ = 10.6;
      state.globeTargetNdc.x = .18;
      state.globeTargetNdc.y = -.22;
    } else {
      cameraBaseZ = 8.9;
      state.globeTargetNdc.x = camera.aspect < 1.35 ? .26 : camera.aspect < 1.7 ? .36 : .44;
      state.globeTargetNdc.y = -.13;
    }
    camera.position.z = cameraBaseZ / state.zoomCurrent;
    camera.updateProjectionMatrix();
    updateGlobePlacement();
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
    updateGlobePlacement();
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
    const paused = state.manuallyPaused || (finePointer.matches && state.cardHover);

    if (!state.dragging && !paused) {
      const autoRotateRate = stage.clientWidth < 620 ? .000014 : .000008;
      const motionPreferenceScale = reducedMotion.matches ? .45 : 1;
      globeGroup.rotateY(delta * autoRotateRate * motionPreferenceScale + state.velocity.x);
      globeGroup.rotateX(state.velocity.y);
      const rotationDamping = Math.pow(.95, delta / 16.667);
      state.velocity.x *= rotationDamping;
      state.velocity.y *= rotationDamping;
    }

    updateZoom(delta);
    updateCenterCoordinates();
    updateMarkerPresentation(time, delta);
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
    const samples = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
    for (const sample of samples) {
      const dx = THREE.MathUtils.clamp(sample.clientX - state.pointer.x, -72, 72);
      const dy = THREE.MathUtils.clamp(sample.clientY - state.pointer.y, -72, 72);
      state.pointer.x = sample.clientX;
      state.pointer.y = sample.clientY;
      const horizontal = dx * DRAG_HORIZONTAL;
      const vertical = dy * DRAG_VERTICAL;
      globeGroup.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), horizontal);
      globeGroup.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), vertical);
      state.velocity.x = THREE.MathUtils.lerp(state.velocity.x, horizontal * .14, .58);
      state.velocity.y = THREE.MathUtils.lerp(state.velocity.y, vertical * .11, .58);
    }
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

    window.addEventListener('keydown', (event) => {
      if (!globeGroup || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      if (!stage.matches(':hover') && document.activeElement !== ui.motion) return;
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
      buildStoryCards();
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
