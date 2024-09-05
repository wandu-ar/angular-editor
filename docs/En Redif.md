
ng serve --host 0.0.0.0 --port 4204 --disableHostCheck

config.ts
  upload?: (file: File) => Observable<string>;



angular-editor-toolbar.component.ts

this.upload(file).subscribe(() => this.watchUploadImage);

this.upload(file).subscribe((imageUrl: string) => {

});


Correccion de color picker.
Traduccion de botones y alertas.
Cambio en como recibe la imagen de upload e inserción de link.
