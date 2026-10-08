# Constituency boundary sources

## 2010–2019 geography

`constituencies-2019.geojson.gz` is the ONS December 2019 Generalised
Constituency Boundaries dataset, geographic code field `PCON19CD`, name field
`PCON19NM`. It has 650 constituencies and is used for the 2010, 2015, 2017
and 2019 declared election results. Those elections share the 2010–2019 seat
geography used by the Parliament results database.

The original layer is available from the
[ONS ArcGIS feature service](https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WPC_Dec_2019_GCB_UK_2022/FeatureServer/0).
The source is WGS84; the build simplifies it directly for Leaflet. The layer is
provided under the Open Government Licence and contains Ordnance Survey data.
Retain the ONS and OS attribution stated in the service metadata.

## 2024 geography

`data/source/constituency.geojson` comes from Automatic Knowledge's
[UK Constituencies 2024 GeoJSON dataset](https://automatic-knowledge.com/).
It is licensed CC BY 4.0. The source is EPSG:3857 and includes a hexbin overlay;
`scripts/build-data.mjs` strips that overlay, reprojects the geometry to
WGS84, then simplifies it. Credit Automatic Knowledge in redistributions.

The 2010–2019 and 2024 geographic codes are different. The build verifies each
results file against its matching boundary epoch and does not treat equal seat
names as a geographic crosswalk.
