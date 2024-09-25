# niivue-itk-wasm

itkwasm enables universal [image and mesh processing](https://wasm.itk.org/en/latest/introduction/packages.html) via WebAssembly (wasm). However, itkwasm uses its own [binary format for images (iwi) and meshes (iwm)](https://wasm.itk.org/en/latest/introduction/file_formats/index.html). Therefore, for other tools to use itkwasm, they must read and write these formats. This repository converts between the popular [NIfTI image format](https://brainder.org/2012/09/23/the-nifti-file-format/) and iwi, and converts between triangular meshes (defined by vertex position and vertex indices) and iwm. This allows tools like NiiVue to use itkwasm functions. To see this in action, try the [live demo](https://niivue.github.io/niivue-itk-wasm/)

## Creating validation IWI images

This repository is designed to convert between NIfTI and iwi. To validate this function, you can use a simple Python script with the itkwasm reference implementation to generate iwi images from a NIfTI input. This will work with any NIfTI image, but in this example we use the file `LAS.nii.gz` from the [NIfTIspace](https://github.com/rordenlab/NIfTIspace) repository.

```python
import itkwasm
from itkwasm_image_io import imread, imwrite
image = imread('LAS.nii.gz', component_type=itkwasm.int_types.IntTypes.UInt8)
imwrite(image, 'u8.iwi.cbor')
image = imread('LAS.nii.gz', component_type=itkwasm.int_types.IntTypes.UInt16)
imwrite(image, 'u16.iwi.cbor')
image = imread('LAS.nii.gz', component_type=itkwasm.int_types.IntTypes.Int16)
imwrite(image, 'i16.iwi.cbor')
image = imread('LAS.nii.gz', component_type=itkwasm.int_types.IntTypes.Int32)
imwrite(image, 'i32.iwi.cbor')
image = imread('LAS.nii.gz', component_type=itkwasm.float_types.FloatTypes.Float32)
imwrite(image, 'f32.iwi.cbor')
image = imread('LAS.nii.gz', component_type=itkwasm.float_types.FloatTypes.Float64)
imwrite(image, 'f64.iwi.cbor')
```

## Creating validation IWM meshes

We can also use the reference Python library to create iwm meshes. Here we convert the mesh [simplify_brain.obj](https://github.com/niivue/niivue/tree/main/tests/images) from WaveFront OBJ format to IWM.

```python
from itkwasm_mesh_io import meshread, meshwrite
mesh = meshread('simplify_brain.obj')
meshwrite(mesh, 'stl.stl')
meshwrite(mesh, 'iwm.iwm.cbor')
```
