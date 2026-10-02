/**
 * Where a circuit's elevation comes from (`circuit-elevation.ts`), and the credit the Replay
 * caption gives it. The full notices are in `THIRD_PARTY_NOTICES.md`.
 */

/**
 * `copernicus-glo30`: the Copernicus GLO-30 DEM, for every circuit it covers. `srtm`: NASA SRTM
 * heights from the AWS Terrain Tiles, for Baku, which GLO-30 leaves out (Azerbaijan).
 */
export type ElevationSource = 'copernicus-glo30' | 'srtm';

/**
 * The credit under the Track Map panel, per source. GLO-30's is the notice its licence asks for
 * on modified data, word for word.
 */
export const ELEVATION_CREDIT: Record<ElevationSource, string> = {
  'copernicus-glo30':
    'Elevation produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.',
  srtm: 'Elevation: NASA SRTM, via the AWS Terrain Tiles.',
};
