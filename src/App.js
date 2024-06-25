import React from 'react';
import 'leaflet/dist/leaflet.css'; // Import Leaflet CSS
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';

// Assuming your GeoJSON file is named constituency.geojson and stored locally
import constituencyData from './public/constituency.geojson';

function MyMap() {
  return (
    <MapContainer center={[54.5, -2.5]} zoom={7} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeoJSON data={constituencyData} />
    </MapContainer>
  );
}

function App() {
  return (
    <div className="App">
      <MyMap />
    </div>
  );
}

export default App;