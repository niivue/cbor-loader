// Import the decode and encode functions from 'cbor-x'
import { decode, encode } from 'cbor-x'
import * as nifti from 'nifti-reader-js'

// itkwasm reads and writes images and meshes as cbor
// https://docs.itk.org/en/latest/learn/python_quick_start.html
//  itk wasm images have the extension ".iwi.cbor"
//  itk wasm meshes have the extension ".iwm.cbor"

// Input is ITK IWM, output is mesh with vertices (positions) and indices (0-indexed)
// https://github.com/InsightSoftwareConsortium/ITK-Wasm/issues/1235
export function iwm2meshCore(iwm) {
  if (
    !Object.prototype.hasOwnProperty.call(iwm, 'meshType') ||
    !Object.prototype.hasOwnProperty.call(iwm, 'cells') ||
    !Object.prototype.hasOwnProperty.call(iwm, 'points')
  ) {
    throw new Error('.iwm.cbor must have "meshType", "cells" and "points".')
  }
  let cells
  if ((iwm.cells instanceof BigUint64Array) || (iwm.cells instanceof BigInt64Array)) {
    cells = new Uint32Array(iwm.cells.length)
    for (let i = 0; i < iwm.cells.length; i++) {
      cells[i] = Number(BigInt(iwm.cells[i]) & BigInt(0xffffffff))
    }
  } else if (iwm.cells[0] instanceof Uint32Array || typeof iwm.cells[0] === 'number') {
    cells = new Uint32Array(iwm.cells)
  } else {
    throw new Error("Unsupported data type in iwm.cells")
  }
  // 1st pass: count triangles
  let ntri = 0
  let i = 0
  while (i < cells.length) {
    // enum cell type 2=TRIANGLE_CELL 3=QUADRILATERAL_CELL 4=POLYGON_CELL
    const cellType = cells[i]
    const cellNum = cells[i + 1]
    if (cellType < 2 || cellType < 2 || cellNum < 3) {
      throw new Error(`unsupported iwm cell type ${cellType} or cellNum ${cellNum}`)
    }
    i += cellNum + 2 // skip cellNum, cellType and elements
    ntri += cellNum - 2 // e.g. TRIANGLE has 1 tri, QUAD has 2
  }
  // each triangle has 3 faces
  const indices = new Uint32Array(ntri * 3)
  // 2nd pass: populate triangles
  i = 0
  let j = 0
  while (i < cells.length) {
    const cellNum = cells[i + 1]
    const newTri = cellNum - 2 // e.g. TRIANGLE has 1 tri, QUAD has two
    for (let t = 0; t < newTri; t++) {
      // for each triangle
      indices[j++] = cells[i + 2]
      indices[j++] = cells[i + 2 + 1 + t]
      indices[j++] = cells[i + 2 + 2 + t]
    }
    i += cellNum + 2 // skip cellNum, cellType and elements
  }
  const positions = new Float32Array(iwm.points)
  // TODO check NIFTI is RAS, IWM is LPS ??
  i = 0
  while (i < positions.length) {
    positions[i] = -positions[i]
    positions[i + 1] = -positions[i + 1]
    i += 3
  }
  return {
    positions,
    indices
  }
}

export function iwm2mesh(arrayBuffer) {
  // decode from cbor to JS object
  const iwm = decode(new Uint8Array(arrayBuffer))
  // console.log(iwm)
  return iwm2meshCore(iwm)
}

// Input is triangular mesh with points [x0 y0 z0 x1 y1 z1...] and triangle indices [i0 j0 k0 i1 j1 k1 ...]
export function mesh2iwm(pts, tris, isEncodeCBOR = true) {
  const iwm = {
    meshType: {
      dimension: 3,
      pointComponentType: 'float32',
      pointPixelComponentType: 'int8',
      pointPixelType: 'Scalar',
      pointPixelComponents: 0,
      cellComponentType: 'uint64',
      cellPixelComponentType: 'int8',
      cellPixelType: 'Scalar',
      cellPixelComponents: 0
    },
    numberOfPointPixels: 0n,
    numberOfCellPixels: 0n
  }
  // populate cells: one per triangle
  const ntri = Math.floor(tris.length / 3)
  // for iwm format, each triangle has 5 cells; DataType DataNum I J K
  const cellBufferSize = ntri * 5
  iwm.cells = new BigUint64Array(cellBufferSize)
  let j = 0
  let k = 0
  for (let t = 0; t < ntri; t++) {
    // for each triangle
    iwm.cells[j++] = 2n // TriangleCell
    iwm.cells[j++] = 3n // Triangle has 3 indices
    iwm.cells[j++] = BigInt(tris[k++])
    iwm.cells[j++] = BigInt(tris[k++])
    iwm.cells[j++] = BigInt(tris[k++])
  }
  iwm.cellBufferSize = BigInt(cellBufferSize)
  iwm.numberOfCells = BigInt(ntri)
  iwm.points = pts.slice()
  // reorient vertices NIFTI is RAS, IWM is LPS ??
  let i = 0
  while (i < iwm.points.length) {
    iwm.points[i] = -iwm.points[i]
    iwm.points[i + 1] = -iwm.points[i + 1]
    i += 3
  }
  iwm.numberOfPoints = BigInt(Math.floor(pts.length) / 3)
  // console.log(iwm)
  if (isEncodeCBOR) {
    return encode(iwm)
  }
  return iwm
}

// Input is ITK IWI, output is NIfTI
export function iwi2niiCore(iwi) {
  if (
    !Object.prototype.hasOwnProperty.call(iwi, 'imageType') ||
    !Object.prototype.hasOwnProperty.call(iwi, 'size') ||
    !Object.prototype.hasOwnProperty.call(iwi, 'data')
  ) {
    throw new Error('.iwi.cbor must have "imageType", "size" and "data".')
  }
  const hdr = new nifti.NIFTI1()
  hdr.littleEndian = true
  // set dims
  hdr.dims = [3, 1, 1, 1, 0, 0, 0, 0]
  hdr.dims[0] = iwi.size.length
  let nvox = 1
  for (let i = 0; i < iwi.size.length; i++) {
    hdr.dims[i + 1] = Number(BigInt(iwi.size[i]) & BigInt(0xffffffff))
    nvox *= Math.max(hdr.dims[i + 1], 1)
  }
  // set pixDims
  hdr.pixDims = [1, 1, 1, 1, 1, 0, 0, 0]
  if (Object.prototype.hasOwnProperty.call(iwi, 'spacing')) {
    for (let i = 0; i < iwi.spacing.length; i++) {
      hdr.pixDims[i + 1] = iwi.spacing[i]
    }
  }
  if (iwi.data instanceof Uint8Array) {
    if (Object.prototype.hasOwnProperty.call(iwi.imageType, 'pixelType') && iwi.imageType.pixelType === 'RGB') {
      hdr.numBitsPerVoxel = 24
      hdr.datatypeCode = 128 // DT_RGB24
    } else {
      hdr.numBitsPerVoxel = 8
      hdr.datatypeCode = 2 // DT_UINT8
    }
  } else if (iwi.data instanceof Int16Array) {
    hdr.numBitsPerVoxel = 16
    hdr.datatypeCode = 4 // DT_INT16
  } else if (iwi.data instanceof Uint16Array) {
    hdr.numBitsPerVoxel = 16
    hdr.datatypeCode = 512 // DT_UINT16
  } else if (iwi.data instanceof Int32Array) {
    hdr.numBitsPerVoxel = 32
    hdr.datatypeCode = 8 // DT_INT32
  } else if (iwi.data instanceof Float64Array) {
    hdr.numBitsPerVoxel = 64
    hdr.datatypeCode = 64 // DT_FLOAT64
  } else if (iwi.data instanceof Float32Array) {
    hdr.numBitsPerVoxel = 32
    hdr.datatypeCode = 16 // DT_FLOAT32
  } else {
    throw new Error('.iwi.cbor voxels use unsupported datatype.')
  }
  const nbyte = nvox * Math.floor(hdr.numBitsPerVoxel / 8)
  // see https://github.com/InsightSoftwareConsortium/ITK-Wasm/issues/1239
  const img8 = new Uint8Array(iwi.data.buffer, iwi.data.byteOffset, iwi.data.byteLength)
  if (nbyte !== img8.byteLength) {
    throw new Error(`expected ${nbyte} bytes but have ${img8.byteLength}`)
  }
  hdr.vox_offset = 352
  hdr.scl_inter = 0
  hdr.scl_slope = 1 // todo: check
  hdr.magic = 'n+1'
  if (Object.prototype.hasOwnProperty.call(iwi, 'direction') && Object.prototype.hasOwnProperty.call(iwi, 'origin')) {
    // NIFTI is RAS, IWI is LPS
    // https://www.nitrc.org/plugins/mwiki/index.php/dcm2nii:MainPage#Spatial_Coordinates
    const m = iwi.direction.slice() // matrix
    const mm = iwi.spacing.slice() // millimeters
    const o = iwi.origin
    hdr.sform_code = 1
    hdr.affine = [
      [m[0] * -mm[0], m[3] * -mm[1], m[6] * -mm[2], -o[0]],
      [m[1] * -mm[0], m[4] * -mm[1], m[7] * -mm[2], -o[1]],
      [m[2] * mm[0], m[5] * mm[1], m[8] * mm[2], o[2]],
      [0, 0, 0, 1]
    ]
  }
  // console.log(hdr)
  const hdrBytes = hdr.toArrayBuffer()
  const odata = new Uint8Array(hdrBytes.byteLength + img8.byteLength)
  odata.set(new Uint8Array(hdrBytes), 0)
  odata.set(img8, hdrBytes.byteLength)
  return odata
}

// Input is ITK IWI, output is NIfTI
export function iwi2nii(arrayBuffer) {
  // decode from cbor to JS object
  const iwi = decode(new Uint8Array(arrayBuffer))
  return iwi2niiCore(iwi)
}

// Input is ITK IWI, output is NIfTI
export function nii2iwi(hdr, img, isEncodeCBOR = false) {
  const iwi = {
    imageType: {
      dimension: hdr.dims[0],
      componentType: 'uint8',
      pixelType: 'Scalar',
      components: 1
    },
    direction: new Float64Array(9),
    origin: [],
    size: [],
    spacing: [],
    metadata: []
  }

  for (let i = 0; i < hdr.dims[0]; i++) {
    iwi.spacing[i] = hdr.pixDims[i + 1]
    iwi.size[i] = hdr.dims[i + 1]
  }
  if (hdr.dims[0] > 2) {
    // n.b. LPS -> RAS
    iwi.origin[0] = -hdr.affine[0][3]
    iwi.origin[1] = -hdr.affine[1][3]
    iwi.origin[2] = hdr.affine[2][3]
    const mm = [hdr.pixDims[1], hdr.pixDims[2], hdr.pixDims[3]]
    iwi.direction[0] = hdr.affine[0][0] / -mm[0]
    iwi.direction[1] = hdr.affine[1][0] / -mm[0]
    iwi.direction[2] = hdr.affine[2][0] / mm[0]
    iwi.direction[3] = hdr.affine[0][1] / -mm[1]
    iwi.direction[4] = hdr.affine[1][1] / -mm[1]
    iwi.direction[5] = hdr.affine[2][1] / mm[1]
    iwi.direction[6] = hdr.affine[0][2] / -mm[2]
    iwi.direction[7] = hdr.affine[1][2] / -mm[2]
    iwi.direction[8] = hdr.affine[2][2] / mm[2]
  }
  if (hdr.datatypeCode === 128) {
    iwi.imageType.pixelType = 'RGB'
    iwi.imageType.componentType = 'uint8'
    iwi.imageType.components = 3
    iwi.data = new Uint8Array(img)
  } else if (hdr.datatypeCode === 64) {
    iwi.imageType.componentType = 'float64'
    iwi.data = new Float64Array(img)
  } else if (hdr.datatypeCode === 16) {
    iwi.imageType.componentType = 'float32'
    iwi.data = new Float32Array(img)
  } else if (hdr.datatypeCode === 2) {
    iwi.imageType.componentType = 'uint8'
    iwi.data = new Uint8Array(img)
  } else if (hdr.datatypeCode === 4) {
    iwi.imageType.componentType = 'int16'
    iwi.data = new Int16Array(img)
  } else if (hdr.datatypeCode === 8) {
    iwi.imageType.componentType = 'int32'
    iwi.data = new Int32Array(img)
  } else {
    throw new Error(`NIfTI voxels use unsupported datatype ${hdr.datatypeCode}.`)
  }
  iwi.size = iwi.size.map((num) => BigInt(num))
  if (isEncodeCBOR) {
    return encode(iwi)
  }
  return iwi
}
