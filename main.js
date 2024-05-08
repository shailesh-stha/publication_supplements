// Using polygon bounds
var newCoords = [
    [9.067316810890249, 47.628886980143655],
    [9.238291542335562, 47.628886980143655],
    [9.238291542335562, 47.78206385254966],
    [9.067316810890249, 47.78206385254966],
    [9.067316810890249, 47.628886980143655]
  ];
  var rec_bounds = ee.Geometry.Polygon(newCoords);
  
  // Applies scaling factors.
  function applyScaleFactors(image) {
    var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
    var thermalBands = image.select('ST_B.*').multiply(0.00341802).add(149.0);
    return image.addBands(opticalBands, null, true)
                .addBands(thermalBands, null, true);
  }
  
  //cloud mask
  function maskL9SR(col) {
    // Bits 3 and 5 are cloud shadow and cloud
    var cloudShadowBitMask = (1 << 3); // Bit 3: Cloud
    var cloudsBitMask = (1 << 4); // Bit 4: Cloud Shadow
    // Get the pixel QA band
    var qa = col.select('QA_PIXEL');
    // Both flags should be set to zero, indicating clear conditions
    var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
                 .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
    return col.updateMask(mask);
  }
  // https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/media/files/LSDS-1619_Landsat8-9-Collection2-Level2-Science-Product-Guide-v5.pdf
  // https://developers.google.com/earth-engine/datasets/catalog/LANDSAT_LC09_C02_T1_L2
  
  var landsat_collection = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
              .filterDate('2021-10-31', '2024-05-05')
              .filterBounds(rec_bounds)
              .filter(ee.Filter.calendarRange(6,8,'month'));
              
  print('Number of Images:', landsat_collection.size());
  
  var landsat_image = landsat_collection
                      .map(applyScaleFactors)
                      .map(maskL9SR)
                      .median()
                      .clip(rec_bounds);
  
  var visualization = {
    bands: ['SR_B4', 'SR_B3', 'SR_B2'],
    min: 0.0,
    max: 0.3,
  };
  Map.addLayer(landsat_image, visualization, 'True Color (432)');
  Map.centerObject(rec_bounds, 10)
  
  // NDVI
  var ndvi = landsat_image.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI')
  Map.addLayer(ndvi, {min:-1, max:1, palette: ['brown', 'red', 'yellow', 'green']}, 'NDVI')
  
  // NDVI statistics
  var ndvi_min = ee.Number(ndvi.reduceRegion({
    reducer: ee.Reducer.min(),
    geometry: rec_bounds,
    scale: 30,
    maxPixels: 1e9
  }).values().get(0))
  
  var ndvi_max = ee.Number(ndvi.reduceRegion({
    reducer: ee.Reducer.max(),
    geometry: rec_bounds,
    scale: 30,
    maxPixels: 1e9
  }).values().get(0))
  
  // Fraction of Vegetation (fv) ad Emissivity(EM)
  var fv = (ndvi.subtract(ndvi_min).divide(ndvi_max.subtract(ndvi_min))).pow(ee.Number(2)).rename('FV')
  var em = fv.multiply(ee.Number(0.004)).add(ee.Number(0.986)).rename('EM')
  var thermal = landsat_image.select('ST_B10').rename('thermal')
  
  var lst = thermal.expression(
    '(tb / (1 + (0.00115 * (tb/0.48359547432)) * log(em))) - 273.15',
    {'tb':thermal.select('thermal'),'em': em}).rename('LST')
    
  var lst_vis = {
    min: 20,
    max: 50,
    palette: [
      '040274', '040281', '0502a3', '0502b8', '0502ce', '0502e6',
      '0602ff', '235cb1', '307ef3', '269db1', '30c8e2', '32d3ef',
      '3be285', '3ff38f', '86e26f', '3ae237', 'b5e22e', 'd6e21f',
      'fff705', 'ffd611', 'ffb613', 'ff8b13', 'ff6e08', 'ff500d',
      'ff0000', 'de0101', 'c21301', 'a71001', '911003']}
  Map.addLayer(lst, lst_vis, 'LST')
  
  // Urban Heat Island
  var lst_mean = ee.Number(lst.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: rec_bounds,
    scale: 30,
    maxPixels: 1e9
  }).values().get(0))
  
  var lst_std = ee.Number(lst.reduceRegion({
    reducer: ee.Reducer.stdDev(),
    geometry: rec_bounds,
    scale: 30,
    maxPixels: 1e9
  }).values().get(0))
  
  print('Mean LST', lst_mean)
  print('STD LST', lst_std)
  
  var uhi = lst.subtract(lst_mean).divide(lst_std).rename('UHI')
  var uhi_vis = {
    min: -4,
    max: 4,
    palette:['313695', '74add1', 'fed976', 'feb24c', 'fd8d3c', 'fc4e2a', 'e31a1c','b10026']
  }
  Map.addLayer(uhi, uhi_vis, 'UHI')
  
  // Transform and export layers
  var crs = 'EPSG:25832';
  Export.image.toDrive({
    image: ndvi,
    description: 'NDVI',
    crs: crs,
    scale: 30,
    // crsTransform:
    region: rec_bounds});
  
  Export.image.toDrive({
    image: lst,
    description: 'Land_Surface_Temperature',
    crs: crs,
    scale: 30,
    // crsTransform:
    region: rec_bounds});
  
  Export.image.toDrive({
    image: uhi,
    description: 'Urban_Heat_Island',
    crs: crs,
    scale: 30,
    // crsTransform:
    region: rec_bounds});