// Mapové styly
const mapStyles = {
  satellite: {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        attribution: "&copy; Esri"
      },
      terrainSource: {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 15
      }
    },
    layers: [{ id: "satellite", type: "raster", source: "satellite" }],
    terrain: { source: "terrainSource", exaggeration: 1.5 }
  },
  
  osm: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap"
      },
      terrainSource: {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 15
      }
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
    terrain: { source: "terrainSource", exaggeration: 1.5 }
  }
};

// Inicializace mapy
const map = new maplibregl.Map({
  container: "map",
  style: mapStyles.satellite,
  center: [15.5, 49.8], // Česká republika
  zoom: 7,
  pitch: 45,
  bearing: 0
});

// Přidání ovládacích prvků
map.addControl(new maplibregl.NavigationControl(), "top-left");
map.addControl(new maplibregl.ScaleControl(), "bottom-left");
map.addControl(new maplibregl.FullscreenControl(), "top-left");
map.addControl(new maplibregl.TerrainControl({ source: "terrainSource" }), "top-left");

// Globe projekce
map.on("style.load", () => {
  map.setProjection({ type: "globe" });
});

// ===== 3D MODELY =====
let models = [];
let clickListener = null;

// Přidat 3D model
function addModel(coordinates) {
  const modelId = `model-${Date.now()}`;
  const size = 0.0004;
  
  // Vytvoření 3D objektu (barevný hranol)
  map.addSource(modelId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [coordinates[0] - size, coordinates[1] - size],
          [coordinates[0] + size, coordinates[1] - size],
          [coordinates[0] + size, coordinates[1] + size],
          [coordinates[0] - size, coordinates[1] + size],
          [coordinates[0] - size, coordinates[1] - size]
        ]]
      },
      properties: { height: 100, base: 0 }
    }
  });
  
  map.addLayer({
    id: modelId,
    type: 'fill-extrusion',
    source: modelId,
    paint: {
      'fill-extrusion-color': '#FF5722',
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-opacity': 0.9
    }
  });
  
  // Přidat marker
  const el = document.createElement('div');
  el.className = 'model-marker';
  el.innerHTML = '🏰';
  
  const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat(coordinates)
    .addTo(map);
  
  // Odstranění při kliknutí
  el.addEventListener('click', () => {
    if (map.getLayer(modelId)) map.removeLayer(modelId);
    if (map.getSource(modelId)) map.removeSource(modelId);
    marker.remove();
    models = models.filter(m => m.id !== modelId);
  });
  
  models.push({ id: modelId, marker });
}

// Tlačítko "Přidat model"
document.getElementById('add-model').addEventListener('click', () => {
  map.getCanvas().style.cursor = 'crosshair';
  
  if (clickListener) {
    map.off('click', clickListener);
  }
  
  clickListener = (e) => {
    addModel([e.lngLat.lng, e.lngLat.lat]);
    map.getCanvas().style.cursor = '';
    map.off('click', clickListener);
    clickListener = null;
  };
  
  map.on('click', clickListener);
});

// Změna stylu mapy
document.getElementById('map-style').addEventListener('change', (e) => {
  const center = map.getCenter();
  const zoom = map.getZoom();
  const pitch = map.getPitch();
  const bearing = map.getBearing();
  
  map.setStyle(mapStyles[e.target.value]);
  
  map.once("style.load", () => {
    map.setProjection({ type: "globe" });
    map.jumpTo({ center, zoom, pitch, bearing });
    
    // Obnovit modely
    const savedModels = [...models];
    models.forEach(m => {
      if (map.getLayer(m.id)) map.removeLayer(m.id);
      if (map.getSource(m.id)) map.removeSource(m.id);
      m.marker.remove();
    });
    models = [];
    
    savedModels.forEach(m => {
      const coords = m.marker.getLngLat();
      addModel([coords.lng, coords.lat]);
    });
  });
});

// Vymazat vše
document.getElementById('clear-all').addEventListener('click', () => {
  models.forEach(m => {
    if (map.getLayer(m.id)) map.removeLayer(m.id);
    if (map.getSource(m.id)) map.removeSource(m.id);
    m.marker.remove();
  });
  models = [];
});