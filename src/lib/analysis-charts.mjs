/* The Analysis page's charts in reading order, each under the question it answers.
   `height` holds a chart's place, in page pixels, until it is drawn. */
export const ANALYSIS_CHARTS = [
  { key: 'cc', question: 'Does a higher cost come with a higher Balance?', height: 660 },
  { key: 'map', question: 'Which Pieces resemble each other?', height: 560 },
  { key: 'sync', question: 'How closely does each picture follow its sound?', height: 500 },
  { key: 'ct', question: 'Do newer models score higher on Complexity?', height: 550 },
  { key: 'to', question: 'How much thinking sits behind the output?', height: 550 },
  { key: 'words', question: 'Which words turn up in titles?', height: 300 },
];
