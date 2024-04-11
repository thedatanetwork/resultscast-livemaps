// mapSetup.js -- from ResultsCast LiveMaps prototype
// https://github.com/thedatanetwork/resultscast-livemaps

// Initialize the map
function initializeMap(callback) {
    // Create the map
    map = L.map('map', {
        center: [39.50, -98.35],
        zoom: 4,
        zoomControl: false
    });

    initialCenter = map.getCenter();
    initialZoom = map.getZoom();

    addTileLayer();
    setupBounds();
    addControlZoom();
    setupMarkerClusterGroup();
    fetchGeoJsonData();
    //verify callback is a valid function
    if (typeof callback === 'function') {
        callback();
    }
}

// Add tile layer to the map
function addTileLayer() {
    L.tileLayer('https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/about" target="_blank">OpenStreetMap</a> contributors',
    }).addTo(map);
}

// Setup bounds for the map
function setupBounds() {
    var bounds = L.latLngBounds(L.latLng(-89.98155760646617, -180), L.latLng(89.99346179538875, 180));
    map.setMaxBounds(bounds);
    map.on('drag', function() {
        map.panInsideBounds(bounds, { animate: false });
    });
}

// Add zoom control to the map
function addControlZoom() {
    L.control.zoom({
        position: 'topright'
    }).addTo(map);
}

// Setup marker cluster group
function setupMarkerClusterGroup() {
    markers = L.markerClusterGroup({
        chunkedLoading: true,
        iconCreateFunction: function(cluster) {
            return L.divIcon({
                className: 'custom-cluster-icon',
                html: '<div><span>' + calculateChargingStations(cluster) + '</span></div>',
                iconSize: L.point(40, 40)
            });
        },
        maxClusterRadius: function(mapZoom) {
            if (mapZoom > 6 && mapZoom < 9) return 50;
            else if (mapZoom > 8) return 0;
            else return 80;
        }
    });
}

// Modify the calculateChargingStations function for detailed error logging
function calculateChargingStations(cluster) {
    var stationsCount = 0;
    cluster.getAllChildMarkers().forEach(function(layer) {
        if (!layer.feature || !layer.feature.properties || typeof layer.feature.properties.num_stations !== 'number') {
            // Constructing a detailed error message
            const errorMessage = `Missing feature or properties in layer: ${JSON.stringify(layer.feature)}`;
            console.error(errorMessage);
        } else {
            stationsCount += layer.feature.properties.num_stations;
        }
    });
    return stationsCount;
}

function getCustomMarkerIcon(plug1Power, isSelected) {
    let color = 'orange'; // Default color
    if (plug1Power > 200) color = 'green';
    else if (plug1Power >= 50 && plug1Power <= 200) color = 'blue';

    // Modify color or icon if selected
    if (isSelected) {
        color = '#00C3FF'; // Example color for selected markers
    }

    // Using SVG to simulate FontAwesome icon
    const iconHtml = `
        <svg viewBox="0 0 384 512" width="24" height="24" xmlns="http://www.w3.org/2000/svg" style="fill:${color};">
            <path d="M168 0C75.1 0 0 75.1 0 168c0 123.5 134.5 282.6 152.2 301.8a24 24 0 0 0 33.6 0C249.5 450.6 384 291.5 384 168 384 75.1 308.9 0 216 0h-48zM192 256a88 88 0 1 1 88-88 88.1 88.1 0 0 1-88 88z"/>
        </svg>`;

    return L.divIcon({
        html: iconHtml,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        className: '' // This removes default styling
    });
}

// Fetch GeoJSON data and create layer
function fetchGeoJsonData() {
    // Get current bounds and zoom level of the map
    var bounds = map.getBounds();
    var zoom = map.getZoom();

    // Construct the API URL with the necessary parameters
    var apiUrl = `/api/stations?bounds=${bounds.toBBoxString()}&zoom=${zoom}`;

    // Fetch data from the Flask API endpoint
    $.getJSON(apiUrl, function(data) {
        console.log(data); // Log the GeoJSON data to inspect its structure
        createGeoJsonLayer(data);
    }).fail(function(jqxhr, textStatus, error) {
        console.error("Request Failed: " + textStatus + ", " + error);
    });
}

// Function to initialize or update the GeoJSON layer on the map
function createGeoJsonLayer(data, reset = false) {
    markers.clearLayers(); // Clear existing markers from the cluster group before adding new ones
    var bounds = new L.LatLngBounds();
    const newDataHash = generateDataHash(data);

    if (!isInitialized || reset) {
        if (!isInitialized) {
            // Initial setup: populate allMarkersData and build allMarkersDataObject
            data.features.forEach(feature => {
                const markerData = {
                    id: feature.properties.id,
                    latitude: feature.geometry.coordinates[1],
                    longitude: feature.geometry.coordinates[0],
                    num_stations: feature.properties.num_stations,
                    plug1_power: feature.properties.plug1_power,
                };
                allMarkersData.push(markerData);
                allMarkersDataObject[feature.properties.id] = markerData;
            });

            // Generate a complete GeoJSON representation for all markers
            allMarkersGeoJSON = generateGeoJSONFromDataObject(allMarkersDataObject);

            // Indicate that the initial setup is complete
            isInitialized = true;
        }
        currentDataHash = newDataHash; // Store the hash of newly initialized data
        data = allMarkersGeoJSON; // Use the stored allMarkersGeoJSON for resetting or initial load
        markersDataObject = { ...allMarkersDataObject }; // Use the stored allMarkersDataObject for resetting or initial load
        totalChargingStations = allMarkersData.reduce((acc, marker) => acc + marker.num_stations, 0);
        currentMarkerCount = allMarkersData.length;
        setMarkerCountDisplay(adjustNavPanelHeight); // Update UI with the new counts
    } else if (newDataHash !== currentDataHash) {
        // Filtered/search calls: Update markersDataObject based on the filtered data
        markersDataObject = {};
        data.features.forEach(feature => {
            const id = feature.properties.id;
            if (allMarkersDataObject[id]) {
                markersDataObject[id] = {...allMarkersDataObject[id]};
            }
            });
        // After updating markersDataObject, recalculate total charging stations and update UI accordingly
        totalChargingStations = Object.values(markersDataObject).reduce((acc, marker) => acc + marker.num_stations, 0);
        currentMarkerCount = Object.keys(markersDataObject).length;
        updateMarkerCountDisplay(); // Update UI with the new counts if isInitialized was false or data has changed
        currentDataHash = newDataHash; // Update the current hash after processing
    } else {
        markersDataObject = { ...allMarkersDataObject };
        // Recalculate total charging stations and update UI accordingly
        totalChargingStations = Object.values(markersDataObject).reduce((acc, marker) => acc + marker.num_stations, 0);
        currentMarkerCount = Object.keys(markersDataObject).length;
        setMarkerCountDisplay(adjustNavPanelHeight); // Update UI with the new counts
    }

    // Generate GeoJSON from the updated or initial markersDataObject
    data = generateGeoJSONFromDataObject(markersDataObject);

    // Process the GeoJSON data to create markers and add them to the cluster group
    L.geoJson(data, {
        onEachFeature: function(feature, layer) {
            layer.feature = feature; // Ensure each layer has a feature property for later use
            onEachFeature(feature, layer);
        },
        pointToLayer: function(feature, latlng) {
            const customIcon = getCustomMarkerIcon(parseFloat(feature.properties.plug1_power));
            const marker = L.marker(latlng, {icon: customIcon});
            marker.feature = feature; // Ensure feature data is attached
            markers.addLayer(marker); // Add marker to the cluster group with complete data
            bounds.extend(marker.getLatLng()); // Extend bounds for each marker
            return marker;
        }
    });

    // Add the cluster group to the map if not already present
    if (!map.hasLayer(markers)) {
        map.addLayer(markers);
    }

    // Fit map bounds to markers if bounds are valid
    if (bounds.isValid()) {
        map.fitBounds(bounds, {padding: [50, 50]});
    }
}

// Helper function to generate GeoJSON from a data object
function generateGeoJSONFromDataObject(dataObject) {
    return {
        type: "FeatureCollection",
        features: Object.values(dataObject).map(item => ({
            type: "Feature",
            properties: {
                id: item.id,
                num_stations: item.num_stations,
                plug1_power: item.plug1_power,
                // Add other properties as needed
            },
            geometry: {
                type: "Point",
                coordinates: [item.longitude, item.latitude]
            }
        }))
    };
}

