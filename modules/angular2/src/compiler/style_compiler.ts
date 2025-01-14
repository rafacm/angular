import {CompileTypeMetadata, CompileDirectiveMetadata} from './directive_metadata';
import {SourceModule, SourceExpression, moduleRef} from './source_module';
import {ViewEncapsulation} from 'angular2/src/core/render/api';
import {XHR} from 'angular2/src/core/render/xhr';
import {StringWrapper, isBlank} from 'angular2/src/core/facade/lang';
import {PromiseWrapper, Promise} from 'angular2/src/core/facade/async';
import {ShadowCss} from 'angular2/src/core/render/dom/compiler/shadow_css';
import {UrlResolver} from 'angular2/src/core/services/url_resolver';
import {resolveStyleUrls} from './style_url_resolver';
import {
  escapeSingleQuoteString,
  IS_DART,
  codeGenConcatArray,
  codeGenMapArray,
  codeGenReplaceAll,
  codeGenExportVariable
} from './util';
import {Injectable} from 'angular2/src/core/di';

const COMPONENT_VARIABLE = '%COMP%';
var COMPONENT_REGEX = /%COMP%/g;
const HOST_ATTR = `_nghost-${COMPONENT_VARIABLE}`;
const CONTENT_ATTR = `_ngcontent-${COMPONENT_VARIABLE}`;

@Injectable()
export class StyleCompiler {
  private _styleCache: Map<string, Promise<string[]>> = new Map<string, Promise<string[]>>();
  private _shadowCss: ShadowCss = new ShadowCss();

  constructor(private _xhr: XHR, private _urlResolver: UrlResolver) {}

  compileComponentRuntime(component: CompileDirectiveMetadata): Promise<string[]> {
    var styles = component.template.styles;
    var styleAbsUrls = component.template.styleUrls;
    return this._loadStyles(styles, styleAbsUrls,
                            component.template.encapsulation === ViewEncapsulation.Emulated)
        .then(styles => styles.map(style => StringWrapper.replaceAll(style, COMPONENT_REGEX,
                                                                     `${component.type.id}`)));
  }

  compileComponentCodeGen(component: CompileDirectiveMetadata): SourceExpression {
    var shim = component.template.encapsulation === ViewEncapsulation.Emulated;
    var suffix;
    if (shim) {
      var componentId = `${ component.type.id}`;
      suffix =
          codeGenMapArray(['style'], `style${codeGenReplaceAll(COMPONENT_VARIABLE, componentId)}`);
    } else {
      suffix = '';
    }
    return this._styleCodeGen(component.template.styles, component.template.styleUrls, shim,
                              suffix);
  }

  compileStylesheetCodeGen(moduleId: string, cssText: string): SourceModule[] {
    var styleWithImports = resolveStyleUrls(this._urlResolver, moduleId, cssText);
    return [
      this._styleModule(moduleId, false, this._styleCodeGen([styleWithImports.style],
                                                            styleWithImports.styleUrls, false, '')),
      this._styleModule(moduleId, true, this._styleCodeGen([styleWithImports.style],
                                                           styleWithImports.styleUrls, true, ''))
    ];
  }

  clearCache() { this._styleCache.clear(); }

  private _loadStyles(plainStyles: string[], absUrls: string[],
                      encapsulate: boolean): Promise<string[]> {
    var promises = absUrls.map((absUrl) => {
      var cacheKey = `${absUrl}${encapsulate ? '.shim' : ''}`;
      var result = this._styleCache.get(cacheKey);
      if (isBlank(result)) {
        result = this._xhr.get(absUrl).then((style) => {
          var styleWithImports = resolveStyleUrls(this._urlResolver, absUrl, style);
          return this._loadStyles([styleWithImports.style], styleWithImports.styleUrls,
                                  encapsulate);
        });
        this._styleCache.set(cacheKey, result);
      }
      return result;
    });
    return PromiseWrapper.all(promises).then((nestedStyles: string[][]) => {
      var result = plainStyles.map(plainStyle => this._shimIfNeeded(plainStyle, encapsulate));
      nestedStyles.forEach(styles => styles.forEach(style => result.push(style)));
      return result;
    });
  }

  private _styleCodeGen(plainStyles: string[], absUrls: string[], shim: boolean,
                        suffix: string): SourceExpression {
    var expressionSource = `(`;
    expressionSource +=
        `[${plainStyles.map( plainStyle => escapeSingleQuoteString(this._shimIfNeeded(plainStyle, shim)) ).join(',')}]`;
    for (var i = 0; i < absUrls.length; i++) {
      var moduleId = this._shimModuleIdIfNeeded(absUrls[i], shim);
      expressionSource += codeGenConcatArray(`${moduleRef(moduleId)}STYLES`);
    }
    expressionSource += `)${suffix}`;
    return new SourceExpression([], expressionSource);
  }

  private _styleModule(moduleId: string, shim: boolean,
                       expression: SourceExpression): SourceModule {
    var moduleSource = `
      ${expression.declarations.join('\n')}
      ${codeGenExportVariable('STYLES')}${expression.expression};
    `;
    return new SourceModule(this._shimModuleIdIfNeeded(moduleId, shim), moduleSource);
  }

  private _shimIfNeeded(style: string, shim: boolean): string {
    return shim ? this._shadowCss.shimCssText(style, CONTENT_ATTR, HOST_ATTR) : style;
  }

  private _shimModuleIdIfNeeded(moduleId: string, shim: boolean): string {
    return shim ? `${moduleId}.shim` : moduleId;
  }
}

export function shimContentAttribute(componentId: number): string {
  return StringWrapper.replaceAll(CONTENT_ATTR, COMPONENT_REGEX, `${componentId}`);
}

export function shimHostAttribute(componentId: number): string {
  return StringWrapper.replaceAll(HOST_ATTR, COMPONENT_REGEX, `${componentId}`);
}
