import { Dataset, DataSelection } from '../dist/deepscatter.js';
import { Table, vectorFromArray, Utf8 } from 'apache-arrow';
import { test } from 'uvu';
import * as assert from 'uvu/assert';
import {
  createIntegerDataset,
  selectFunctionForFactorsOf,
} from './datasetHelpers.js';

test('Dataset can be created', async () => {
  const dataset = createIntegerDataset();
  const x = await dataset.root_tile.get_column('x');
  assert.is(x.length, 4096);
  const integers = await dataset.root_tile.get_column('integers');
  assert.is(integers.toArray()[10], 10);
});

test('Test composition of selections', async () => {
  const dataset = createIntegerDataset();
  await dataset.root_tile.preprocessRootTileInfo();
  const selectEvens = new DataSelection(dataset, {
    name: 'twos',
    tileFunction: selectFunctionForFactorsOf(2),
  });

  await selectEvens.ready;
  await selectEvens.applyToAllLoadedTiles();

  const selectThree = new DataSelection(dataset, {
    name: 'threes',
    tileFunction: selectFunctionForFactorsOf(3),
  });

  // await selectThree.ready;
  // await selectThree.applyToAllLoadedTiles();

  const selectSix = new DataSelection(dataset, {
    name: 'six',
    composition: ['ALL', selectThree, selectEvens],
  });

  await selectSix.ready;
  await selectSix.applyToAllLoadedTiles();

  assert.ok(
    Math.abs(
      Math.log(selectSix.selectionSize / (selectEvens.selectionSize / 3)),
    ) < 0.01,
    'sixes are the same size as evens over three',
  );

  const selectTwoThree = new DataSelection(dataset, {
    name: 'sixTwo',
    composition: ['ANY', selectThree, selectEvens],
  });
  await selectTwoThree.ready;
  await selectTwoThree.applyToAllLoadedTiles();

  assert.ok(
    Math.abs(
      Math.log(selectTwoThree.selectionSize / (selectSix.selectionSize * 4)),
    ) < 0.01,
    'sixes are 4x as big as twos over threes',
  );
});

test.run();