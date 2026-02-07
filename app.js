import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Základní nastavení mapy
const map = new maplibregl.Map({
  container: "map",
  center: [15.5, 49.8], // Střed ČR
  zoom: 7,
  pitch: 60,
  maxPitch: 85,
  bearing: 0,
  style: {
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
});

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

// Funkce pro vytvoření 3D vrstvy pro památku
function createMonumentLayer(monument, monumentId) {
  return {
    id: `monument-${monumentId}`,
    type: 'custom',
    renderingMode: '3d',
    monument: monument, // Uložíme referenci na data památky
    
    onAdd(map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

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

      // Načtení 3D modelu
      const loader = new GLTFLoader();
      const modelPath = `monuments/${monumentId}/${monument.model.file}`;
      
      loader.load(
        modelPath,
        (gltf) => {
          this.modelGroup.add(gltf.scene);
          console.log(`✅ Model loaded: ${monument.name}`);
          updateStatus(`Načteno: ${monument.name}`, 'success');
        },
        (xhr) => {
          const percent = Math.round((xhr.loaded / xhr.total) * 100);
          console.log(`Loading ${monument.name}: ${percent}%`);
        },
        (error) => {
          console.error(`❌ Error loading ${monument.name}:`, error);
          updateStatus(`Chyba načítání: ${monument.name}`, 'error');
        }
      );

      this.map = map;
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true
      });
      this.renderer.autoClear = false;
    },
    
    render(gl, args) {
      const { location, model } = this.monument;
      const modelMatrix = map.transform.getMatrixForModel(
        [location.longitude, location.latitude],
        location.altitude
      );
      
      const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
      const l = new THREE.Matrix4().fromArray(modelMatrix)
        .scale(new THREE.Vector3(model.scale, model.scale, model.scale))
        .multiply(new THREE.Matrix4().makeRotationZ(model.rotation * Math.PI / 180));

      this.camera.projectionMatrix = m.multiply(l);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.map.triggerRepaint();
    }
  };
}

// Funkce pro vytvoření markeru pro památku
function createMonumentMarker(monument, monumentId) {
  const { location, name, description, info } = monument;
  
  // Vytvoření HTML obsahu pro popup
  const popupContent = `
    <div style="max-width: 250px;">
      <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #333;">${name}</h3>
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #666; line-height: 1.4;">${description}</p>
      <div style="font-size: 12px; color: #888;">
        <div><strong>Kategorie:</strong> ${info.category}</div>
        <div><strong>Region:</strong> ${info.region}</div>
        <div><strong>Rok:</strong> ${info.year}</div>
        ${info.website ? `<div><a href="${info.website}" target="_blank" style="color: #2196F3;">Více informací →</a></div>` : ''}
      </div>
    </div>
  `;

  const popup = new maplibregl.Popup({ offset: 25 })
    .setHTML(popupContent);

  const marker = new maplibregl.Marker({ color: '#2196F3' })
    .setLngLat([location.longitude, location.latitude])
    .setPopup(popup)
    .addTo(map);
  
  return marker;
}

// Hlavní funkce pro načtení všech památek
async function loadMonuments() {
  try {
    updateStatus('Načítám seznam památek...', 'info');
    
    // Načtení hlavního souboru se seznamem památek
    const response = await fetch('monuments/monuments.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    const monumentIds = data.monuments;
    
    updateStatus(`Nalezeno ${monumentIds.length} památek`, 'info');
    
    // Načtení konfigurace každé památky
    for (const monumentId of monumentIds) {
      try {
        const configResponse = await fetch(`monuments/${monumentId}/config.json`);
        if (!configResponse.ok) {
          console.warn(`⚠️ Skipping ${monumentId}: config not found`);
          continue;
        }
        
        const config = await configResponse.json();
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
    updateStatus(`✅ Načteno ${monuments.length} památek`, 'success');
    
  } catch (error) {
    console.error('❌ Error loading monuments:', error);
    updateStatus('Chyba při načítání památek. Zkontrolujte strukturu souborů.', 'error');
  }
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
});

// Tlačítko pro reset kamery
document.getElementById('resetView').addEventListener('click', () => {
  map.flyTo({
    center: [15.5, 49.8],
    zoom: 7,
    pitch: 60,
    bearing: 0,
    duration: 2000
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
