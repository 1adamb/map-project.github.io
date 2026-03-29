/**
 * České Památky 3D - Interaktivní Mapová Aplikace
 * Verze: 1.4.0
 * Datum: 7. února 2025
 * 
 * Změny ve verzi 1.4.0:
 * - PŘIDÁNO: LOD (Level of Detail) - skrývání vzdálených modelů (parametr minZoom)
 * - Optimalizace výkonu pro velké množství památek
 * 
 * Změny ve verzi 1.3.0:
 * - PŘIDÁNO: Podmíněné stahování modelů (parametr downloadable)
 * - ZMĚNĚNO: Výchozí mapa je nyní turistická (OpenStreetMap)
 * - ODSTRANĚNO: Hiking mapa
 * - OPRAVENO: Bug s duplikací památek při přepnutí mapy
 * 
 * Změny ve verzi 1.2.0:
 * - PŘIDÁNO: Přepínání mezi satelitní a turistickou mapou
 * - ZMĚNĚNO: Rotace modelů nyní funguje kolem vertikální osy Y
 * 
 * Změny ve verzi 1.1.0:
 * - OPRAVENO: Bug s výškou modelů na 3D terénu
 * - PŘIDÁNO: Odkaz na stažení 3D modelu v popupu
 * - Automatická korekce altitude podle nadmořské výšky terénu
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Základní nastavení mapy
const map = new maplibregl.Map({
  container: "map",
  center: [15.5, 49.8], // Střed ČR
  zoom: 7,
  pitch: 0,
  maxPitch: 85,
  bearing: 0,
  style: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
      terrainSource: {
        type: "raster-dem",
        tiles: [
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        ],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 15,
        attribution: "AWS Terrain Tiles",
      },
    },
    layers: [
      {
        id: "osm",
        type: "raster",
        source: "osm",
      },
    ],
    terrain: {
      source: "terrainSource",
      exaggeration: 1.1,
    },
  },
});

// Map styles configuration
const mapStyles = {
  satellite: {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Esri, Maxar, Earthstar Geographics",
      },
      terrainSource: {
        type: "raster-dem",
        tiles: [
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        ],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 15,
        attribution: "AWS Terrain Tiles",
      },
    },
    layers: [
      {
        id: "satellite",
        type: "raster",
        source: "satellite",
      },
    ],
    terrain: {
      source: "terrainSource",
      exaggeration: 1.1,
    },
  },
  tourist: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
      terrainSource: {
        type: "raster-dem",
        tiles: [
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        ],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 15,
        attribution: "AWS Terrain Tiles",
      },
    },
    layers: [
      {
        id: "osm",
        type: "raster",
        source: "osm",
      },
    ],
    terrain: {
      source: "terrainSource",
      exaggeration: 1.1,
    },
  },
};

map.on("style.load", function () {
  map.setProjection({ type: "globe" });
});

// Přidání ovládacích prvků
map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(new maplibregl.ScaleControl(), "bottom-left");
map.addControl(new maplibregl.FullscreenControl(), "top-right");
map.addControl(
  new maplibregl.TerrainControl({ source: "terrainSource" }),
  "top-right"
);

// Úložiště pro památky
const monuments = [];
const monumentLayers = new Map();
const monumentMarkers = new Map();
let currentLanguage = 'cs';
let monumentsLoaded = false;

function getMonumentRenderDistance(model = {}) {
  if (typeof model.renderDistance === 'number') {
    return model.renderDistance;
  }

  const minZoom = model.minZoom !== undefined ? model.minZoom : 8;
  if (minZoom >= 14) return 6000;
  if (minZoom >= 12) return 12000;
  if (minZoom >= 10) return 25000;
  return 50000;
}

function updateActiveMonuments() {
  const mapCenter = map.getCenter();

  monumentLayers.forEach(layer => {
    const { location, model } = layer.monument;
    const monumentPosition = new maplibregl.LngLat(location.longitude, location.latitude);
    const distanceMeters = mapCenter.distanceTo(monumentPosition);
    const renderDistance = getMonumentRenderDistance(model);

    layer.shouldRender = distanceMeters <= renderDistance;

    if (layer.shouldRender) {
      layer.ensureModelLoaded();
    }
  });

  map.triggerRepaint();
}

const i18n = {
  cs: {
    title: 'České Památky',
    subtitle: '3D pohled na památky',
    mapStyleLabel: 'Styl mapy:',
    mapStyleTourist: 'Turistická',
    mapStyleSatellite: 'Satelitní',
    searchPlaceholder: 'Hledat památku...',
    loadingMonuments: 'Načítání památek...',
    resetView: 'Reset pohledu',
    closeList: 'Skrýt',
    openList: 'Otevřít seznam',
    hideList: 'Skrýt seznam',
    loadingListStatus: 'Načítám seznam památek...',
    foundCount: (count) => `Nalezeno ${count} památek`,
    loadedItem: (name) => `Načteno: ${name}`,
    loadError: (name) => `Chyba načítání: ${name}`,
    loadedCount: (count) => `✅ Načteno ${count} památek`,
    listLoadError: 'Chyba při načítání památek. Zkontrolujte strukturu souborů.',
    mapStyleChanged: (style) => `Styl mapy změněn: ${style === 'satellite' ? 'Satelitní' : 'Turistická'}`,
    category: 'Kategorie',
    region: 'Region',
    year: 'Rok',
    website: 'Webové stránky →',
    downloadModel: 'Stáhnout 3D model →',
  },
  en: {
    title: 'Czech Monuments',
    subtitle: '3D monument map',
    mapStyleLabel: 'Map style:',
    mapStyleTourist: 'Tourist',
    mapStyleSatellite: 'Satellite',
    searchPlaceholder: 'Search monument...',
    loadingMonuments: 'Loading monuments...',
    resetView: 'Reset view',
    closeList: 'Hide',
    openList: 'Open list',
    hideList: 'Hide list',
    loadingListStatus: 'Loading monument list...',
    foundCount: (count) => `${count} monuments found`,
    loadedItem: (name) => `Loaded: ${name}`,
    loadError: (name) => `Loading error: ${name}`,
    loadedCount: (count) => `✅ Loaded ${count} monuments`,
    listLoadError: 'Error loading monuments. Check the file structure.',
    mapStyleChanged: (style) => `Map style changed: ${style === 'satellite' ? 'Satellite' : 'Tourist'}`,
    category: 'Category',
    region: 'Region',
    year: 'Year',
    website: 'Website →',
    downloadModel: 'Download 3D model →',
  }
};

function t(key, ...args) {
  const entry = i18n[currentLanguage][key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

function getDistanceMeters(lon1, lat1, lon2, lat2) {
  const toRad = (deg) => deg * Math.PI / 180;
  const earthRadius = 6371000; // meters

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

function applyTranslations() {
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.dataset.i18n;
    const translation = t(key);
    if (translation) {
      element.textContent = translation;
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.dataset.i18nPlaceholder;
    const translation = t(key);
    if (translation) {
      element.placeholder = translation;
    }
  });

  updateSidebarCollapseState();
}

async function fetchLocalizedJson(basePath) {
  const localizedPath = `${basePath}.${currentLanguage}.json`;
  const fallbackPath = `${basePath}.json`;

  try {
    const localizedResponse = await fetch(localizedPath);
    if (localizedResponse.ok) {
      return await localizedResponse.json();
    }
  } catch (error) {
    console.warn(`⚠️ Localized file not available: ${localizedPath}`, error);
  }

  const fallbackResponse = await fetch(fallbackPath);
  if (!fallbackResponse.ok) {
    throw new Error(`HTTP error! status: ${fallbackResponse.status} (${fallbackPath})`);
  }
  return await fallbackResponse.json();
}

// Funkce pro vytvoření 3D vrstvy pro památku
function createMonumentLayer(monument, monumentId) {
  return {
    id: `monument-${monumentId}`,
    type: 'custom',
    renderingMode: '3d',
    monument: monument, // Uložíme referenci na data památky
    shouldRender: false,
    isModelLoaded: false,
    isModelLoading: false,
    loader: null,
    modelPath: null,
    
    onAdd(map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.isModelLoaded = false;
      this.isWithinVisibleDistance = false;

      // Osvětlení
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(0, -70, 100).normalize();
      this.scene.add(directionalLight);

      const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight2.position.set(0, 70, 100).normalize();
      this.scene.add(directionalLight2);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
      this.scene.add(ambientLight);

      this.modelGroup = new THREE.Group();
      this.scene.add(this.modelGroup);

      this.loader = new GLTFLoader();
      this.modelPath = `monuments/${monumentId}/${monument.model.file}`;

      this.map = map;
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true
      });
      this.renderer.autoClear = false;
    },

    ensureModelLoaded() {
      if (this.isModelLoaded || this.isModelLoading || !this.loader || !this.modelPath) {
        return;
      }

      this.isModelLoading = true;
      this.loader.load(
        this.modelPath,
        (gltf) => {
          this.modelGroup.add(gltf.scene);
          this.isModelLoaded = true;
          console.log(`✅ Model loaded: ${monument.name}`);
          updateStatus(t('loadedItem', monument.name), 'success');
        },
        (xhr) => {
          const percent = Math.round((xhr.loaded / xhr.total) * 100);
          console.log(`Loading ${this.monument.name}: ${percent}%`);
        },
        (error) => {
          this.isModelLoading = false;
          console.error(`❌ Error loading ${this.monument.name}:`, error);
          updateStatus(t('loadError', this.monument.name), 'error');
        }
      );
    },
    
    render(gl, args) {
      if (!this.shouldRender || !this.isModelLoaded) return;

      const { location, model } = this.monument;

      if (!this.isModelLoaded) {
        return;
      }

      const currentZoom = map.getZoom();
      const minZoom = model.minZoom !== undefined ? model.minZoom : 8;
      const visibleDistance = model.visibleDistance !== undefined ? model.visibleDistance : Infinity;
      const unloadDistance = model.unloadDistance !== undefined
        ? Math.max(model.unloadDistance, visibleDistance)
        : null;
      const cameraCenter = map.getCenter();
      const distanceToMonument = getDistanceMeters(
        cameraCenter.lng,
        cameraCenter.lat,
        location.longitude,
        location.latitude
      );

      if (unloadDistance !== null) {
        if (!this.isWithinVisibleDistance && distanceToMonument <= visibleDistance) {
          this.isWithinVisibleDistance = true;
        } else if (this.isWithinVisibleDistance && distanceToMonument > unloadDistance) {
          this.isWithinVisibleDistance = false;
        }
      } else {
        this.isWithinVisibleDistance = distanceToMonument <= visibleDistance;
      }

      const passesZoomGuard = currentZoom >= minZoom;
      if (!this.isWithinVisibleDistance || !passesZoomGuard) {
        return;
      }

      // Get terrain elevation at this point to fix altitude bug
      let terrainElevation = 0;
      if (map.getTerrain()) {
        terrainElevation = map.queryTerrainElevation([location.longitude, location.latitude]) || 0;
      }
      
      // Add terrain elevation to altitude so model sits on terrain surface
      const actualAltitude = location.altitude + terrainElevation;
      
      const modelMatrix = map.transform.getMatrixForModel(
        [location.longitude, location.latitude],
        actualAltitude
      );
      
      const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
      const l = new THREE.Matrix4().fromArray(modelMatrix)
        .scale(new THREE.Vector3(model.scale, model.scale, model.scale))
        .multiply(new THREE.Matrix4().makeRotationY(model.rotation * Math.PI / 180));

      this.camera.projectionMatrix = m.multiply(l);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
    }
  };
}

// Funkce pro vytvoření markeru pro památku
function createMonumentMarker(monument, monumentId) {
  const { location, name, description, info, model } = monument;
  
  // URL to the model file
  const modelUrl = `monuments/${monumentId}/${monument.model.file}`;
  
  // Check if download is allowed (default to false if not specified)
  const downloadAllowed = model.downloadable !== undefined ? model.downloadable : false;
  
  // Vytvoření HTML obsahu pro popup
  const popupContent = `
    <div style="max-width: 250px;">
      <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #333;">${name}</h3>
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #666; line-height: 1.4;">${description}</p>
      <div style="font-size: 12px; color: #888;">
        <div><strong>${t('category')}:</strong> ${info.category}</div>
        <div><strong>${t('region')}:</strong> ${info.region}</div>
        <div><strong>${t('year')}:</strong> ${info.year}</div>
        ${info.website ? `<div style="margin-top: 8px;"><a href="${info.website}" target="_blank" style="color: #b47200ff; text-decoration: none;">${t('website')}</a></div>` : ''}
        ${downloadAllowed ? `<div style="margin-top: 4px;"><a href="${modelUrl}" download style="color: #956400ff; text-decoration: none;">${t('downloadModel')}</a></div>` : ''}
      </div>
    </div>
  `;

  const popup = new maplibregl.Popup({ offset: 25 })
    .setHTML(popupContent);

  const marker = new maplibregl.Marker({ color: '#ff8522ff' })
    .setLngLat([location.longitude, location.latitude])
    .setPopup(popup)
    .addTo(map);
  
  return marker;
}

// Hlavní funkce pro načtení všech památek
async function loadMonuments() {
  if (monumentsLoaded) {
    console.log('Monuments already loaded, skipping...');
    return;
  }
  try {
    updateStatus(t('loadingListStatus'), 'info');
    
    // Načtení hlavního souboru se seznamem památek
    const data = await fetchLocalizedJson('monuments/monuments');
    const monumentIds = data.monuments;
    
    updateStatus(t('foundCount', monumentIds.length), 'info');
    
    // Načtení konfigurace každé památky
    for (const monumentId of monumentIds) {
      try {
        const config = await fetchLocalizedJson(`monuments/${monumentId}/config`);
        monuments.push({ id: monumentId, ...config });
        
        // Vytvoření 3D vrstvy a markeru pro památku
        const layer = createMonumentLayer(config, monumentId);
        const marker = createMonumentMarker(config, monumentId);
        
        monumentLayers.set(monumentId, layer);
        monumentMarkers.set(monumentId, marker);
        
      } catch (error) {
        console.error(`❌ Error loading ${monumentId}:`, error);
      }
    }
    
    updateMonumentsList();
    updateStatus(t('loadedCount', monuments.length), 'success');

    monumentsLoaded = true;
    
  } catch (error) {
    console.error('❌ Error loading monuments:', error);
    updateStatus(t('listLoadError'), 'error');
  }
}

function rebuildMonumentMarkers() {
  monumentMarkers.forEach(marker => marker.remove());
  monumentMarkers.clear();

  monuments.forEach(monument => {
    const marker = createMonumentMarker(monument, monument.id);
    monumentMarkers.set(monument.id, marker);
  });
}

async function reloadMonumentLocalization() {
  if (!monumentsLoaded) return;

  for (let i = 0; i < monuments.length; i++) {
    const monumentId = monuments[i].id;
    try {
      const localizedConfig = await fetchLocalizedJson(`monuments/${monumentId}/config`);
      monuments[i] = { id: monumentId, ...localizedConfig };
    } catch (error) {
      console.error(`❌ Error loading localized config for ${monumentId}:`, error);
    }
  }

  monumentLayers.forEach(layer => {
    const monumentId = layer.id.replace('monument-', '');
    const updatedMonument = monuments.find(monument => monument.id === monumentId);
    if (updatedMonument) {
      layer.monument = updatedMonument;
    }
  });

  rebuildMonumentMarkers();
  updateMonumentsList();
}

// Aktualizace seznamu památek v UI
function updateMonumentsList() {
  const listContainer = document.getElementById('monumentsList');
  listContainer.innerHTML = '';
  
  monuments.forEach(monument => {
    const item = document.createElement('div');
    item.className = 'monument-item';
    item.innerHTML = `
      <div class="monument-name">${monument.name}</div>
      <div class="monument-category">${monument.info.category} • ${monument.info.region}</div>
    `;
    
    item.addEventListener('click', () => {
      map.flyTo({
        center: [monument.location.longitude, monument.location.latitude],
        zoom: 15,
        pitch: 60,
        bearing: monument.model.rotation,
        duration: 2000
      });
      
      // Otevřít popup markeru
      const marker = monumentMarkers.get(monument.id);
      if (marker) {
        marker.togglePopup();
      }
    });
    
    listContainer.appendChild(item);
  });
}

// Aktualizace statusu
function updateStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
  
  if (type === 'success') {
    setTimeout(() => {
      status.className = 'status';
    }, 3000);
  }
}

// Inicializace po načtení mapy
map.on('style.load', async () => {
  // Načtení všech památek
  await loadMonuments();
  
  // Přidání všech 3D vrstev na mapu
  monumentLayers.forEach(layer => {
    map.addLayer(layer);
  });

  updateActiveMonuments();
});

map.on('move', updateActiveMonuments);
map.on('moveend', updateActiveMonuments);
map.on('zoom', updateActiveMonuments);

// Tlačítko pro reset kamery
document.getElementById('resetView').addEventListener('click', () => {
  map.flyTo({
    center: [15.5, 49.8],
    zoom: 7,
    pitch: 0,
    bearing: 0,
    duration: 2000
  });
});

// Přepínání stylu mapy
document.getElementById('mapStyle').addEventListener('change', (e) => {
  const selectedStyle = e.target.value;
  const currentCenter = map.getCenter();
  const currentZoom = map.getZoom();
  const currentPitch = map.getPitch();
  const currentBearing = map.getBearing();
  
  // Změna stylu
  map.setStyle(mapStyles[selectedStyle]);
  
  // Po načtení nového stylu obnovit stav
  map.once('style.load', () => {
    // Obnovit projekci
    map.setProjection({ type: "globe" });
    
    // Obnovit pozici
    map.jumpTo({
      center: currentCenter,
      zoom: currentZoom,
      pitch: currentPitch,
      bearing: currentBearing
    });
    
    // Znovu přidat 3D vrstvy památek - kontrola existence aby se předešlo duplikaci
    monumentLayers.forEach(layer => {
      // Zkontrolovat, jestli vrstva už existuje
      if (!map.getLayer(layer.id)) {
        map.addLayer(layer);
      }
    });
    
    updateStatus(t('mapStyleChanged', selectedStyle), 'success');
  });
});

// Vyhledávání památek
document.getElementById('searchInput').addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const items = document.querySelectorAll('.monument-item');
  
  items.forEach(item => {
    const name = item.querySelector('.monument-name').textContent.toLowerCase();
    if (name.includes(searchTerm)) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
});

document.getElementById('languageSelect').addEventListener('change', async (event) => {
  currentLanguage = event.target.value;
  applyTranslations();
  await reloadMonumentLocalization();
  updateStatus(t('loadedCount', monuments.length), 'success');
});

// Ovládání bočního panelu
const mobileToggleButton = document.getElementById('mobileSidebarToggle');
const mobileCloseButton = document.getElementById('mobileSidebarClose');
const sidebar = document.getElementById('sidebar');
let wasMobileLayout = window.matchMedia('(max-width: 768px)').matches;

function updateSidebarCollapseState() {
  if (!mobileToggleButton || !sidebar) return;

  const collapsed = sidebar.classList.contains('sidebar-collapsed');
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  if (isMobile) {
    sidebar.classList.remove('sidebar-collapsed-desktop');
    const collapsed = sidebar.classList.contains('sidebar-collapsed');
    mobileToggleButton.setAttribute('aria-expanded', String(!collapsed));
    mobileToggleButton.textContent = collapsed ? t('openList') : t('hideList');

    if (mobileCloseButton) {
      mobileCloseButton.textContent = t('closeList');
      mobileCloseButton.setAttribute('aria-label', t('closeList'));
      mobileCloseButton.setAttribute('title', t('closeList'));
    }
    return;
  }

  sidebar.classList.remove('sidebar-collapsed');
  const desktopCollapsed = sidebar.classList.contains('sidebar-collapsed-desktop');
  mobileToggleButton.setAttribute('aria-expanded', 'true');
  mobileToggleButton.textContent = t('openList');

  if (mobileCloseButton) {
    const arrow = desktopCollapsed ? '▶' : '◀';
    const label = desktopCollapsed ? t('openList') : t('closeList');
    mobileCloseButton.textContent = arrow;
    mobileCloseButton.setAttribute('aria-label', label);
    mobileCloseButton.setAttribute('title', label);
  }
}

  if (mobileToggleButton) {
    mobileToggleButton.style.display = 'none';
    mobileToggleButton.setAttribute('aria-expanded', String(!collapsed));
  }
  updateSidebarCollapseState();

  mobileCloseButton.addEventListener('click', () => {
    sidebar.classList.toggle('sidebar-collapsed');
    updateSidebarCollapseState();
  });

  window.addEventListener('resize', updateSidebarCollapseState);
}

if (mobileCloseButton && sidebar) {
  mobileCloseButton.addEventListener('click', () => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      sidebar.classList.add('sidebar-collapsed');
    } else {
      sidebar.classList.toggle('sidebar-collapsed-desktop');
    }
    updateSidebarCollapseState();
  });

  window.addEventListener('resize', updateSidebarCollapseState);
  updateSidebarCollapseState();
}

applyTranslations();
