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

## 2001 election geography

constituencies-2001.geojson.gz contains 659 features: 641 Great Britain polygons from the ONS 2001/2005 Westminster constituency dataset and 18 Northern Ireland polygons constructed from the 1995 statutory order applied to the open OSNI 1993 ward layer. The Northern Ireland construction assigns all 582 source wards once. Provenance and source limits are recorded in [docs/historical-source-inventory.md](../../../docs/historical-source-inventory.md).

The NI geometry uses 1993 wards although the order references wards as at 1 June 1994; it is therefore a one-year source-vintage approximation at 1:50,000 detail. The ONS catalogue record's dataset-specific licence field is not set; the page-level default OGL term is recorded without presenting it as an unqualified dataset-specific licence.

The exact geometry identity is 2001. The Commons Library uses 1997–2001 PCA result codes, but its boundary-history paper records interim changes before 2001. This geometry must not be used as the exact 1997 map.

The separate 1995 NI FOI polygon archive is not an input because its OSNI/LPS-derived reuse terms remain unresolved.
