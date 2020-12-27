
ng serve --host 10.0.0.6 --port 4204 --ssl --disableHostCheck

config.ts
  upload?: (file: File) => Observable<string>;



angular-editor-toolbar.component.ts

this.upload(file).subscribe(() => this.watchUploadImage);

this.upload(file).subscribe((imageUrl: string) => {

});


Correccion de color picker.
Traduccion de botones y alertas.
Cambio en como recibe la imagen de upload e inserción de link.
