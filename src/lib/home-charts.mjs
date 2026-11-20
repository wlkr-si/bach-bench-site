/* What the home page's three column charts share with the cards that hold
   their place while the chart code loads. */

/* Columns per measure. Few enough that every name stays readable. */
export const HOME_COLUMNS = 12;

/* Height kept under the columns for the slanted names, in page pixels. */
export const HOME_NAME_BAND = 101;

/* Height of a home chart's plot, from the top of its scale to the foot of its names. */
export const HOME_PLOT_HEIGHT = 311.6;

export const HOME_SAY = {
  complexity: 'Complexity measures how much is going on: pitches, rhythm, range and change in the sound, and detail, colour and motion in the picture. A fixed formula scores each recorded Clip from 0 to 100.',
  sync: 'Sync measures how closely visible changes line up with audible attacks and shifts in the sound. A fixed formula scores each recorded Clip from 0 to 100.',
  uniqueness: 'Uniqueness measures how far each Piece’s sound, picture, structure and title sit from every other published Piece. A fixed formula scores it from 0 to 100, so it shifts as Pieces are added.',
};

export const homeCaption = (key, scored) =>
  HOME_SAY[key] + (scored > HOME_COLUMNS ? ` The ${HOME_COLUMNS} highest of ${scored} are shown.` : '');
