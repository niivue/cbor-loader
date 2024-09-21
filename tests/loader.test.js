import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { decode } from 'cbor-x';
import { iwm2mesh, mesh2iwm, iwi2nii, nii2iwi } from '../src/loader.js'; 
import * as nifti from 'nifti-reader-js';

describe('IWM and IWI Conversion Tests', () => {
  
  it('should convert iwm.cbor to a mesh and back to iwm.cbor', async () => {
    const iwmFilePath = join(__dirname, 'testData', 'cow.iwm.cbor'); 
    const originalIWMBuffer = await fs.readFile(iwmFilePath);

    // convert iwm.cbor to a mesh
    const meshResult = iwm2mesh(originalIWMBuffer);
    expect(meshResult).toHaveProperty('positions');
    expect(meshResult).toHaveProperty('indices');

    // convert the mesh back to iwm.cbor
    const newIWMBuffer = mesh2iwm(meshResult.positions, meshResult.indices, true);

    // compare the result with the original iwm.cbor file
    const originalIWM = decode(originalIWMBuffer);
    const newIWM = decode(newIWMBuffer);
    console.log(newIWM);
    // make sure n.meshType property object is the same
    expect(newIWM.meshType).toEqual(originalIWM.meshType);
    // and numberOfPoints
    expect(newIWM.numberOfPoints).toEqual(originalIWM.numberOfPoints);
  });

  it('should convert iwi.cbor to NIfTI format and back to iwi.cbor', async () => {
    const iwiFilePath = join(__dirname, 'testData', 'fslmean.iwi.cbor'); 
    const originalIWIBuffer = await fs.readFile(iwiFilePath);

    // convert iwi.cbor to NIfTI format
    const niftiResult = iwi2nii(originalIWIBuffer);
    // write out the niftiResult to a file
    await fs.writeFile(join(__dirname, 'testData', 'fslmean_from_iwi.nii'), niftiResult);
    expect(niftiResult).toBeInstanceOf(Uint8Array);
    
    // read the nifti file that we wrote 
    const niftiBuffer = await fs.readFile(join(__dirname, 'testData', 'fslmean_from_iwi.nii'));
    const niftiHeader = nifti.readHeader(niftiBuffer.buffer);
    const niftiImageData = nifti.readImage(niftiHeader, niftiBuffer);

    // convert the NIfTI back to iwi.cbor
    const newIWIResult = nii2iwi(niftiHeader, niftiImageData, true);

    // compare the result with the original iwi.cbor file
    const originalIWI = decode(originalIWIBuffer);
    const newIWI = decode(newIWIResult);
    console.log(newIWI);
    // compare the .imageType, .origin, .size, .spacing, .direction properties
    expect(newIWI.imageType).toEqual(originalIWI.imageType);
    expect(newIWI.origin).toEqual(originalIWI.origin);
    expect(newIWI.size).toEqual(originalIWI.size);
    expect(newIWI.spacing).toEqual(originalIWI.spacing);
    // check if the direction values are close enough
    const tolerance = 1e-6;
    for (let i = 0; i < newIWI.direction.length; i++) {
      expect(Math.abs(newIWI.direction[i] - originalIWI.direction[i])).toBeLessThan(tolerance);
    }
  });
});