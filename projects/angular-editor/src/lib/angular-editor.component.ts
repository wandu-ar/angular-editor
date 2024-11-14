import {
  AfterViewInit,
  Attribute,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  HostBinding,
  HostListener,
  Inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  Renderer2,
  Sanitizer,
  SecurityContext,
  ViewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AngularEditorConfig, angularEditorConfig } from './config';
import { AngularEditorToolbarComponent } from './angular-editor-toolbar.component';
import { AngularEditorService } from './angular-editor.service';
import { DOCUMENT } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { isDefined } from './utils';

import * as sanitizeHtml from 'sanitize-html';

@Component({
  selector: 'angular-editor',
  templateUrl: './angular-editor.component.html',
  styleUrls: ['./angular-editor.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AngularEditorComponent),
      multi: true,
    },
    AngularEditorService,
  ],
})
export class AngularEditorComponent
  implements OnInit, ControlValueAccessor, AfterViewInit, OnDestroy
{
  private onChange: (value: string) => void;
  private onTouched: () => void;

  modeVisual = true;
  showPlaceholder = false;
  disabled = false;
  focused = false;
  touched = false;
  changed = false;

  loadingIds = [];

  focusInstance: any;
  blurInstance: any;

  @Input() id = '';
  @Input() config: AngularEditorConfig = angularEditorConfig;
  @Input() placeholder = '';
  @Input() tabIndex: number | null;

  @Output() html;

  @ViewChild('editor', { static: true }) textArea: ElementRef;
  @ViewChild('editorWrapper', { static: true }) editorWrapper: ElementRef;
  @ViewChild('editorToolbar') editorToolbar: AngularEditorToolbarComponent;

  @Output() viewMode = new EventEmitter<boolean>();

  /** emits `blur` event when focused out from the textarea */
  // tslint:disable-next-line:no-output-native no-output-rename
  @Output('blur') blurEvent: EventEmitter<FocusEvent> = new EventEmitter<FocusEvent>();

  /** emits `focus` event when focused in to the textarea */
  // tslint:disable-next-line:no-output-rename no-output-native
  @Output('focus') focusEvent: EventEmitter<FocusEvent> = new EventEmitter<FocusEvent>();

  @HostBinding('attr.tabindex') tabindex = -1;

  @HostListener('focus')
  onFocus() {
    this.focus();
  }

  // @HostListener('drop', ['$event'])
  // onDrop(event: DragEvent) {
  //   event.preventDefault();
  //   console.log(event.dataTransfer);
  //   console.log('Files lenght:', event.dataTransfer.files.length);
  //   console.log('Items lenght:', event.dataTransfer.items.length);
  //   const droppedText = event.dataTransfer?.getData('text');
  //   console.log(droppedText);
  //   for (let i = 0; i < event.dataTransfer.items.length; i++) {
  //     const item = event.dataTransfer.items[i];
  //     item.getAsString((text) => {
  //       console.log('Dropped item:', item, item.kind, item.type, droppedText);
  //     })
  //   }

  //   for (let i = 0; i < event.dataTransfer.files.length; i++) {
  //     const item = event.dataTransfer.files[i];
  //     console.log('Dropped item:', item, item.type, droppedText);
  //   }
  // }

  constructor(
    private r: Renderer2,
    private editorService: AngularEditorService,
    @Inject(DOCUMENT) private doc: any,
    private sanitizer: DomSanitizer,
    private cdRef: ChangeDetectorRef,
    @Attribute('tabindex') defaultTabIndex: string,
    @Attribute('autofocus') private autoFocus: any,
  ) {
    const parsedTabIndex = Number(defaultTabIndex);
    this.tabIndex = parsedTabIndex || parsedTabIndex === 0 ? parsedTabIndex : null;
  }

  ngOnInit() {
    this.config.toolbarPosition = this.config.toolbarPosition
      ? this.config.toolbarPosition
      : angularEditorConfig.toolbarPosition;
  }

  ngAfterViewInit() {
    if (isDefined(this.autoFocus)) {
      this.focus();
    }
  }

  /**
   * Executed command from editor header buttons
   * @param command string from triggerCommand
   */
  executeCommand(command: string) {
    this.focus();
    if (command === 'focus') {
      return;
    }
    if (command === 'toggleEditorMode') {
      this.toggleEditorMode(this.modeVisual);
    } else if (command !== '') {
      if (command === 'clear') {
        this.editorService.removeSelectedElements(this.getCustomTags());
        this.onContentChange(this.textArea.nativeElement);
      } else if (command === 'default') {
        this.editorService.removeSelectedElements('h1,h2,h3,h4,h5,h6,p,pre');
        this.onContentChange(this.textArea.nativeElement);
      } else {
        this.editorService.executeCommand(command);
      }
      this.exec();
    }
  }

  /**
   * focus event
   */
  onTextAreaFocus(event: FocusEvent): void {
    if (this.focused) {
      event.stopPropagation();
      return;
    }
    this.focused = true;
    this.focusEvent.emit(event);
    if (!this.touched || !this.changed) {
      this.editorService.executeInNextQueueIteration(() => {
        this.configure();
        this.touched = true;
      });
    }
  }

  /**
   * @description fires when cursor leaves textarea
   */
  public onTextAreaMouseOut(event: MouseEvent): void {
    this.editorService.saveSelection();
  }

  /**
   * blur event
   */
  onTextAreaBlur(event: FocusEvent) {
    /**
     * save selection if focussed out
     */
    this.editorService.executeInNextQueueIteration(this.editorService.saveSelection);

    if (typeof this.onTouched === 'function') {
      this.onTouched();
    }

    if (event.relatedTarget !== null) {
      const parent = (event.relatedTarget as HTMLElement).parentElement;
      if (
        !parent.classList.contains('angular-editor-toolbar-set') &&
        !parent.classList.contains('ae-picker')
      ) {
        this.blurEvent.emit(event);
        this.focused = false;
      }
    }
  }

  /**
   *  focus the text area when the editor is focused
   */
  focus() {
    if (this.modeVisual) {
      this.textArea.nativeElement.focus();
    } else {
      const sourceText = this.doc.getElementById('sourceText' + this.id);
      sourceText.focus();
      this.focused = true;
    }
  }

  /**
   * Executed from the contenteditable section while the input property changes
   * @param element html element from contenteditable
   */
  onContentChange(element: HTMLElement): void {
    let html = '';
    if (this.modeVisual) {
      html = element.innerHTML;
    } else {
      html = element.innerText;
    }
    if (!html || html === '<br>') {
      html = '';
    }
    if (typeof this.onChange === 'function') {
      this.onChange(
        this.config.sanitize || this.config.sanitize === undefined
          ? this.sanitizer.sanitize(SecurityContext.HTML, html)
          : html,
      );
      if (!html !== this.showPlaceholder) {
        this.togglePlaceholder(this.showPlaceholder);
      }
    }
    this.changed = true;
  }

  /**
   * Set the function to be called
   * when the control receives a change event.
   *
   * @param fn a function
   */
  registerOnChange(fn: any): void {
    this.onChange = (e) => (e === '<br>' ? fn('') : fn(e));
  }

  /**
   * Set the function to be called
   * when the control receives a touch event.
   *
   * @param fn a function
   */
  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  /**
   * Write a new value to the element.
   *
   * @param value value to be executed when there is a change in contenteditable
   */
  writeValue(value: any): void {
    if ((!value || value === '<br>' || value === '') !== this.showPlaceholder) {
      this.togglePlaceholder(this.showPlaceholder);
    }

    if (value === undefined || value === '' || value === '<br>') {
      value = null;
    }

    this.refreshView(value);
  }

  /**
   * refresh view/HTML of the editor
   *
   * @param value html string from the editor
   */
  refreshView(value: string): void {
    const normalizedValue = value === null ? '' : value;
    this.r.setProperty(this.textArea.nativeElement, 'innerHTML', normalizedValue);

    return;
  }

  /**
   * toggles placeholder based on input string
   *
   * @param value A HTML string from the editor
   */
  togglePlaceholder(value: boolean): void {
    if (!value) {
      this.r.addClass(this.editorWrapper.nativeElement, 'show-placeholder');
      this.showPlaceholder = true;
    } else {
      this.r.removeClass(this.editorWrapper.nativeElement, 'show-placeholder');
      this.showPlaceholder = false;
    }
  }

  /**
   * Implements disabled state for this element
   *
   * @param isDisabled Disabled flag
   */
  setDisabledState(isDisabled: boolean): void {
    const div = this.textArea.nativeElement;
    const action = isDisabled ? 'addClass' : 'removeClass';
    this.r[action](div, 'disabled');
    this.disabled = isDisabled;
  }

  /**
   * toggles editor mode based on bToSource bool
   *
   * @param bToSource A boolean value from the editor
   */
  toggleEditorMode(bToSource: boolean) {
    let oContent: any;
    const editableElement = this.textArea.nativeElement;

    if (bToSource) {
      oContent = this.r.createText(editableElement.innerHTML);
      this.r.setProperty(editableElement, 'innerHTML', '');
      this.r.setProperty(editableElement, 'contentEditable', false);

      const oPre = this.r.createElement('pre');
      this.r.setStyle(oPre, 'margin', '0');
      this.r.setStyle(oPre, 'outline', 'none');

      const oCode = this.r.createElement('code');
      this.r.setProperty(oCode, 'id', 'sourceText' + this.id);
      this.r.setStyle(oCode, 'display', 'block');
      this.r.setStyle(oCode, 'white-space', 'pre-wrap');
      this.r.setStyle(oCode, 'word-break', 'keep-all');
      this.r.setStyle(oCode, 'outline', 'none');
      this.r.setStyle(oCode, 'margin', '0');
      this.r.setStyle(oCode, 'background-color', '#fff5b9');
      this.r.setProperty(oCode, 'contentEditable', true);
      this.r.appendChild(oCode, oContent);
      this.focusInstance = this.r.listen(oCode, 'focus', (event) => this.onTextAreaFocus(event));
      this.blurInstance = this.r.listen(oCode, 'blur', (event) => this.onTextAreaBlur(event));
      this.r.appendChild(oPre, oCode);
      this.r.appendChild(editableElement, oPre);

      // ToDo move to service
      this.doc.execCommand('defaultParagraphSeparator', false, 'div');

      this.modeVisual = false;
      this.viewMode.emit(false);
      oCode.focus();
    } else {
      if (this.doc.querySelectorAll) {
        this.r.setProperty(editableElement, 'innerHTML', editableElement.innerText);
      } else {
        oContent = this.doc.createRange();
        oContent.selectNodeContents(editableElement.firstChild);
        this.r.setProperty(editableElement, 'innerHTML', oContent.toString());
      }
      this.r.setProperty(editableElement, 'contentEditable', true);
      this.modeVisual = true;
      this.viewMode.emit(true);
      this.onContentChange(editableElement);
      editableElement.focus();
    }
    this.editorToolbar.setEditorMode(!this.modeVisual);
  }

  /**
   * toggles editor buttons when cursor moved or positioning
   *
   * Send a node array from the contentEditable of the editor
   */
  exec() {
    this.editorToolbar.triggerButtons();

    let userSelection;
    if (this.doc.getSelection) {
      userSelection = this.doc.getSelection();
      this.editorService.executeInNextQueueIteration(this.editorService.saveSelection);
    }

    let a = userSelection.focusNode;
    const els = [];
    while (a && a.id !== 'editor') {
      els.unshift(a);
      a = a.parentNode;
    }
    this.editorToolbar.triggerBlocks(els);
  }

  private configure() {
    this.editorService.uploadUrl = this.config.uploadUrl;
    this.editorService.uploadWithCredentials = this.config.uploadWithCredentials;
    if (this.config.defaultParagraphSeparator) {
      this.editorService.setDefaultParagraphSeparator(this.config.defaultParagraphSeparator);
    }
    if (this.config.defaultFontName) {
      this.editorService.setFontName(this.config.defaultFontName);
    }
    if (this.config.defaultFontSize) {
      this.editorService.setFontSize(this.config.defaultFontSize);
    }
  }

  getFonts() {
    const fonts = this.config.fonts ? this.config.fonts : angularEditorConfig.fonts;
    return fonts.map((x) => {
      return { label: x.name, value: x.name };
    });
  }

  getCustomTags() {
    const tags = ['span'];
    this.config.customClasses.forEach((x) => {
      if (x.tag !== undefined) {
        if (!tags.includes(x.tag)) {
          tags.push(x.tag);
        }
      }
    });
    return tags.join(',');
  }

  ngOnDestroy() {
    if (this.blurInstance) {
      this.blurInstance();
    }
    if (this.focusInstance) {
      this.focusInstance();
    }
  }

  filterStyles(html: string): string {
    html = html.replace('position: fixed;', '');
    return html;
  }

  async onDrop(event: DragEvent) {
    // Detener el comportamiento por defecto
    event.preventDefault();
    try {
      await this.processDataTransfer(event.dataTransfer);
    } finally {
      this.emitChanges();
    }
  }

  async onPaste(event: ClipboardEvent) {
    // Detener el comportamiento por defecto
    event.preventDefault();
    try {
      await this.processDataTransfer(event.clipboardData);
    } finally {
      this.emitChanges();
    }
  }

  /**
   * Nota de ALE:
   * El problema que encontre que dataTransferItem.getAsString no es async sino callback,
   * por eso no puedo armar algo sincrónico pero tampoco algo asincrónico
   * por lo que debo primero saber que obtener antes de hacerlo para elegir texto plano o html.
   *
   * Usando promesas y almacenandolas como código sincrono supere el problema del vaciado inmediato
   * del buffer de data transfer. La idea fue "almaceno todo como promesa para leer despues".
   *
   * Console log event puede devolver items vacios ya que el buffer se vacia, hay que loggear
   * cada item. Al parecer, el evento es global y se mantiene actualizado en memoria
   *
   * propiedad "files" de DataTransfer replica tmb en items, directamente usamos items
   */
  async processDataTransfer(data: DataTransfer) {
    // console.log('Items lenght:', data.items.length);

    const items = [];

    // Completar itemGroups para decidir que hacer luego
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.kind === 'string') {
        if (item.type === 'text/html') {
          items.push({
            kind: 'html',
            item: this.getAsStringAsync(item), // ! No usar await, vacía el buffer de data transfer
          });
        }
        if (item.type === 'text/plain') {
          items.push({
            kind: 'plainText',
            item: this.getAsStringAsync(item), // ! No usar await, vacía el buffer de data transfer
          });
        }
      } else if (item.kind === 'file') {
        if (item.type.match('^image/')) {
          items.push({
            kind: 'image',
            item: this.getAsFileAsync(item), // ! No usar await, vacía el buffer de data transfer
          });
        } else {
          items.push({
            kind: 'otherFile',
            item: this.getAsFileAsync(item), // ! No usar await, vacía el buffer de data transfer
          });
        }
      }
    }

    // Espero a que todas las promesas se resuelvan antes de continuar
    await Promise.all(items.map((item) => item.item));

    // console.log(items);

    // Agrupar
    const itemGroups = {
      htmlItems: [],
      plainTextItems: [],
      imageItems: [],
      otherFileItems: [],
    };

    for (const item of items) {
      const content = await item.item; // la promesa ya fue resuelta
      if (!content) continue;
      //
      switch (item.kind) {
        case 'html':
          itemGroups.htmlItems.push(content);
          break;
        case 'plainText':
          itemGroups.plainTextItems.push(content);
          break;
        case 'image':
          itemGroups.imageItems.push(content);
          break;
        case 'otherFile':
          itemGroups.otherFileItems.push(content);
          break;
      }
    }

    // console.log(itemGroups);

    if (this.modeVisual) {
      // Priorizo imágenes
      if (itemGroups.imageItems.length) {
        await this.pasteImages(itemGroups.imageItems);
      } else if (itemGroups.htmlItems.length) {
        this.pasteHTMLs(itemGroups.htmlItems);
      } else if (itemGroups.plainTextItems.length) {
        this.pastePlainTexts(itemGroups.plainTextItems);
      }

      // Los archivos de otros tipos lo mando al final siempre a adjuntar
      if (itemGroups.otherFileItems.length) {
        await this.pasteFiles(itemGroups.otherFileItems);
      }
    } else {
      // En modo editor html, solo se acepta texto plano
      if (itemGroups.plainTextItems.length) {
        this.pastePlainTexts(itemGroups.plainTextItems);
      }
    }
  }

  getAsStringAsync(item: DataTransferItem): Promise<string> {
    return new Promise((resolve, reject) => {
      item.getAsString((text) => {
        // console.log(text);
        if (!text || typeof text !== 'string') reject(new Error('String error.'));
        resolve(text);
      });
    });
  }

  getAsFileAsync(item: DataTransferItem): Promise<File> {
    return new Promise((resolve, reject) => {
      const file = item.getAsFile();
      // console.log(file);
      if (!file || !(file instanceof File)) reject(new Error('File error.'));
      resolve(file);
    });
  }

  async pasteFiles(files: File[]) {
    if (this.config.attach) {
      this.config.attach(files);
    }
  }

  async pastePlainTexts(texts: string[]) {
    this.focus();
    if (this.modeVisual) {
      for (let data of texts) {
        data = this.htmlEntities(data);
        data = this.autoLink(data);
        data = '<p>' + data + '</p>';
        data = data.replace(/\n/g, '<br>');
        data = data.replace(/\t/g, '&nbsp;&nbsp;');
        data = data.replace(/\s/g, '&nbsp;');
        // data = data + '<br>'; // añadir enter al final
        // console.log(data);
        this.editorService.insertHtml(data);
      }
    } else {
      this.editorService.insertText(texts.join("\n"));
    }
  }

  pasteHTMLs(texts: string[]) {
    this.focus();
    for (let data of texts) {
      // data = this.sanitizer.sanitize(SecurityContext.HTML, data);
      data = sanitizeHtml(data, {
        allowedTags: [
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'hr',
          'ul',
          'li',
          'ol',
          'span',
          'sub',
          'sup',
          'p',
          'div',
          'b',
          'i',
          'em',
          'strong',
          'a',
          'font',
          'img',
          'dd',
          'dt',
          'dl',
          'blockquote',
          'abbr',
          'br',
          'cite',
          's',
          'strike',
          'stroke',
          'u',
        ],
        allowedAttributes: {
          '*': ['align', 'size', 'center', 'bgcolor', 'style'],
          img: ['src'], // Permitir solo ciertos atributos en img
          a: ['href', 'target'],
        },
        allowedStyles: {
          '*': {
            // Match word color, HEX and RGB
            color: [
              /^[a-z]+$/,
              /^#(0x)?[0-9a-f]+$/i,
              /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/,
            ],
            'text-decoration': [/^.*$/],
            'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
            // Match any number with px, em, or %
            'font-size': [/^\d+(?:px|em|rem|pt|%)$/],
            'font-weight': [/^\d+$/, /^bold$/, /^bolder$/, /^normal$/, /^lighter$/],
          },
        },
        selfClosing: ['img', 'br', 'hr'],
        transformTags: {
          a: (tagName, attribs) => {
            return {
              tagName,
              attribs: {
                ...attribs,
                target: '_blank',
              },
            };
          },
          img: (tagName, attribs) => {
            if (attribs.src && attribs.src.toLowerCase().startsWith('data:')) {
              return {
                tagName: '', // Puedes cambiar la etiqueta a algo más o simplemente eliminarla
                attribs: {},
              };
            }
            return {
              tagName,
              attribs: {
                ...attribs,
                alt: 'Image'
              },
            };
          },
          h1: (tagName, attribs) => ({ tagName: 'p', attribs: { ...attribs, size: '7' } }),
          h2: (tagName, attribs) => ({ tagName: 'p', attribs: { ...attribs, size: '6' } }),
          h3: (tagName, attribs) => ({ tagName: 'p', attribs: { ...attribs, size: '5' } }),
          h4: (tagName, attribs) => ({ tagName: 'p', attribs: { ...attribs, size: '4' } }),
          h5: (tagName, attribs) => ({ tagName: 'p', attribs: { ...attribs, size: '3' } }),
          h6: (tagName, attribs) => ({ tagName: 'p', attribs: { ...attribs, size: '3' } }),
        },
      });

      // console.log(data);
      this.focus();
      if (data) this.editorService.insertHtml(data);
    }
  }

  async pasteImages(files: File[]) {
    this.focus();
    if (this.config.upload) {
      // console.log(files);
      // Show loaders
      const pos = this.loadingIds.push(true) - 1;
      let html = '<br>';
      for (const i in files) {
        html += `
          <div id="image-box-${pos}-${i}" class="loader-container my-1" contenteditable="false">
            <div class="loader-box">
              <div class="loader"></div>
            </div>
          </div>
          <br>
        `;
      }

      //
      this.focus();
      this.editorService.insertHtml(html);

      // console.log(this.textArea.nativeElement);
      const imagesUrls = await this.config.upload(files);
      for (const i in imagesUrls) {
        const imageUrl = imagesUrls[i];
        const referenceElement = this.doc.getElementById(`image-box-${pos}-${i}`);
        if (referenceElement) {
          const parentElement = referenceElement.parentElement;
          // Insertar imagen antes de borrar
          if (imageUrl) {
            const imgNode = this.doc.createElement('img');
            imgNode.src = imageUrl;
            imgNode.alt = 'Image';
            parentElement.insertBefore(imgNode, referenceElement);
          }
          // Eliminar loader y contenido
          referenceElement.remove();
        }
      }
    }
  }

  /**
   * https://github.com/locutusjs/locutus/blob/main/src/php/strings/htmlentities.js
   */
  htmlEntities(string, quoteStyle?, charset?, doubleEncode?) {
    const hashMap = this.getHtmlTranslationTable('HTML_ENTITIES', quoteStyle);

    string = string === null ? '' : string + '';

    if (!hashMap) {
      return false;
    }

    if (quoteStyle && quoteStyle === 'ENT_QUOTES') {
      hashMap["'"] = '&#039;';
    }

    doubleEncode = doubleEncode === null || !!doubleEncode;

    const regex = new RegExp(
      '&(?:#\\d+|#x[\\da-f]+|[a-zA-Z][\\da-z]*);|[' +
        Object.keys(hashMap)
          .join('')
          // replace regexp special chars
          .replace(/([()[\]{}\-.*+?^$|/\\])/g, '\\$1') +
        ']',
      'g',
    );

    return string.replace(regex, function (ent) {
      if (ent.length > 1) {
        return doubleEncode ? hashMap['&'] + ent.substr(1) : ent;
      }

      return hashMap[ent];
    });
  }

  /**
   * https://github.com/locutusjs/locutus/blob/main/src/php/strings/get_html_translation_table.js
   */
  getHtmlTranslationTable(table, quoteStyle) {
    const entities = {};
    const hashMap = {};
    let decimal;
    const constMappingTable = {};
    const constMappingQuoteStyle = {};
    let useTable = {};
    let useQuoteStyle = {};

    // Translate arguments
    constMappingTable[0] = 'HTML_SPECIALCHARS';
    constMappingTable[1] = 'HTML_ENTITIES';
    constMappingQuoteStyle[0] = 'ENT_NOQUOTES';
    constMappingQuoteStyle[2] = 'ENT_COMPAT';
    constMappingQuoteStyle[3] = 'ENT_QUOTES';

    useTable = !isNaN(table)
      ? constMappingTable[table]
      : table
      ? table.toUpperCase()
      : 'HTML_SPECIALCHARS';

    useQuoteStyle = !isNaN(quoteStyle)
      ? constMappingQuoteStyle[quoteStyle]
      : quoteStyle
      ? quoteStyle.toUpperCase()
      : 'ENT_COMPAT';

    if (useTable !== 'HTML_SPECIALCHARS' && useTable !== 'HTML_ENTITIES') {
      throw new Error('Table: ' + useTable + ' not supported');
    }

    entities['38'] = '&amp;';
    if (useTable === 'HTML_ENTITIES') {
      entities['160'] = '&nbsp;';
      entities['161'] = '&iexcl;';
      entities['162'] = '&cent;';
      entities['163'] = '&pound;';
      entities['164'] = '&curren;';
      entities['165'] = '&yen;';
      entities['166'] = '&brvbar;';
      entities['167'] = '&sect;';
      entities['168'] = '&uml;';
      entities['169'] = '&copy;';
      entities['170'] = '&ordf;';
      entities['171'] = '&laquo;';
      entities['172'] = '&not;';
      entities['173'] = '&shy;';
      entities['174'] = '&reg;';
      entities['175'] = '&macr;';
      entities['176'] = '&deg;';
      entities['177'] = '&plusmn;';
      entities['178'] = '&sup2;';
      entities['179'] = '&sup3;';
      entities['180'] = '&acute;';
      entities['181'] = '&micro;';
      entities['182'] = '&para;';
      entities['183'] = '&middot;';
      entities['184'] = '&cedil;';
      entities['185'] = '&sup1;';
      entities['186'] = '&ordm;';
      entities['187'] = '&raquo;';
      entities['188'] = '&frac14;';
      entities['189'] = '&frac12;';
      entities['190'] = '&frac34;';
      entities['191'] = '&iquest;';
      entities['192'] = '&Agrave;';
      entities['193'] = '&Aacute;';
      entities['194'] = '&Acirc;';
      entities['195'] = '&Atilde;';
      entities['196'] = '&Auml;';
      entities['197'] = '&Aring;';
      entities['198'] = '&AElig;';
      entities['199'] = '&Ccedil;';
      entities['200'] = '&Egrave;';
      entities['201'] = '&Eacute;';
      entities['202'] = '&Ecirc;';
      entities['203'] = '&Euml;';
      entities['204'] = '&Igrave;';
      entities['205'] = '&Iacute;';
      entities['206'] = '&Icirc;';
      entities['207'] = '&Iuml;';
      entities['208'] = '&ETH;';
      entities['209'] = '&Ntilde;';
      entities['210'] = '&Ograve;';
      entities['211'] = '&Oacute;';
      entities['212'] = '&Ocirc;';
      entities['213'] = '&Otilde;';
      entities['214'] = '&Ouml;';
      entities['215'] = '&times;';
      entities['216'] = '&Oslash;';
      entities['217'] = '&Ugrave;';
      entities['218'] = '&Uacute;';
      entities['219'] = '&Ucirc;';
      entities['220'] = '&Uuml;';
      entities['221'] = '&Yacute;';
      entities['222'] = '&THORN;';
      entities['223'] = '&szlig;';
      entities['224'] = '&agrave;';
      entities['225'] = '&aacute;';
      entities['226'] = '&acirc;';
      entities['227'] = '&atilde;';
      entities['228'] = '&auml;';
      entities['229'] = '&aring;';
      entities['230'] = '&aelig;';
      entities['231'] = '&ccedil;';
      entities['232'] = '&egrave;';
      entities['233'] = '&eacute;';
      entities['234'] = '&ecirc;';
      entities['235'] = '&euml;';
      entities['236'] = '&igrave;';
      entities['237'] = '&iacute;';
      entities['238'] = '&icirc;';
      entities['239'] = '&iuml;';
      entities['240'] = '&eth;';
      entities['241'] = '&ntilde;';
      entities['242'] = '&ograve;';
      entities['243'] = '&oacute;';
      entities['244'] = '&ocirc;';
      entities['245'] = '&otilde;';
      entities['246'] = '&ouml;';
      entities['247'] = '&divide;';
      entities['248'] = '&oslash;';
      entities['249'] = '&ugrave;';
      entities['250'] = '&uacute;';
      entities['251'] = '&ucirc;';
      entities['252'] = '&uuml;';
      entities['253'] = '&yacute;';
      entities['254'] = '&thorn;';
      entities['255'] = '&yuml;';
    }

    if (useQuoteStyle !== 'ENT_NOQUOTES') {
      entities['34'] = '&quot;';
    }
    if (useQuoteStyle === 'ENT_QUOTES') {
      entities['39'] = '&#39;';
    }
    entities['60'] = '&lt;';
    entities['62'] = '&gt;';

    // ascii decimals to real symbols
    for (decimal in entities) {
      if (entities.hasOwnProperty(decimal)) {
        hashMap[String.fromCharCode(decimal)] = entities[decimal];
      }
    }

    return hashMap;
  }

  autoLink(text: string): string {
    const urlRegex = /(\bhttps?:\/\/[^\s]+[^\s.,;!?])/g;
    return text.replace(urlRegex, (url) => {
      return `<a href="${url}" target="_blank">${url}</a>`;
    });
  }

  emitChanges() {
    this.onContentChange(this.textArea.nativeElement);
  }
}
