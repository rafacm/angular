import {
  CompileTypeMetadata,
  CompileDirectiveMetadata,
  CompileTemplateMetadata
} from './directive_metadata';
import {isPresent, isBlank} from 'angular2/src/core/facade/lang';
import {Promise, PromiseWrapper} from 'angular2/src/core/facade/async';

import {XHR} from 'angular2/src/core/render/xhr';
import {UrlResolver} from 'angular2/src/core/services/url_resolver';
import {resolveStyleUrls} from './style_url_resolver';
import {Injectable} from 'angular2/src/core/di';
import {ViewEncapsulation} from 'angular2/src/core/render/api';

import {
  HtmlAstVisitor,
  HtmlElementAst,
  HtmlTextAst,
  HtmlAttrAst,
  HtmlAst,
  htmlVisitAll
} from './html_ast';
import {HtmlParser} from './html_parser';

import {preparseElement, PreparsedElement, PreparsedElementType} from './template_preparser';

@Injectable()
export class TemplateNormalizer {
  constructor(private _xhr: XHR, private _urlResolver: UrlResolver,
              private _domParser: HtmlParser) {}

  normalizeTemplate(directiveType: CompileTypeMetadata,
                    template: CompileTemplateMetadata): Promise<CompileTemplateMetadata> {
    if (isPresent(template.template)) {
      return PromiseWrapper.resolve(this.normalizeLoadedTemplate(
          directiveType, template, template.template, directiveType.moduleId));
    } else {
      var sourceAbsUrl = this._urlResolver.resolve(directiveType.moduleId, template.templateUrl);
      return this._xhr.get(sourceAbsUrl)
          .then(templateContent => this.normalizeLoadedTemplate(directiveType, template,
                                                                templateContent, sourceAbsUrl));
    }
  }

  normalizeLoadedTemplate(directiveType: CompileTypeMetadata, templateMeta: CompileTemplateMetadata,
                          template: string, templateAbsUrl: string): CompileTemplateMetadata {
    var domNodes = this._domParser.parse(template, directiveType.name);
    var visitor = new TemplatePreparseVisitor();
    htmlVisitAll(visitor, domNodes);
    var allStyles = templateMeta.styles.concat(visitor.styles);

    var allStyleAbsUrls =
        visitor.styleUrls.map(url => this._urlResolver.resolve(templateAbsUrl, url))
            .concat(templateMeta.styleUrls.map(
                url => this._urlResolver.resolve(directiveType.moduleId, url)));

    var allResolvedStyles = allStyles.map(style => {
      var styleWithImports = resolveStyleUrls(this._urlResolver, templateAbsUrl, style);
      styleWithImports.styleUrls.forEach(styleUrl => allStyleAbsUrls.push(styleUrl));
      return styleWithImports.style;
    });
    var encapsulation = templateMeta.encapsulation;
    if (encapsulation === ViewEncapsulation.Emulated && allResolvedStyles.length === 0 &&
        allStyleAbsUrls.length === 0) {
      encapsulation = ViewEncapsulation.None;
    }
    return new CompileTemplateMetadata({
      encapsulation: encapsulation,
      template: template,
      templateUrl: templateAbsUrl,
      styles: allResolvedStyles,
      styleUrls: allStyleAbsUrls,
      ngContentSelectors: visitor.ngContentSelectors
    });
  }
}

class TemplatePreparseVisitor implements HtmlAstVisitor {
  ngContentSelectors: string[] = [];
  styles: string[] = [];
  styleUrls: string[] = [];

  visitElement(ast: HtmlElementAst, context: any): any {
    var preparsedElement = preparseElement(ast);
    switch (preparsedElement.type) {
      case PreparsedElementType.NG_CONTENT:
        this.ngContentSelectors.push(preparsedElement.selectAttr);
        break;
      case PreparsedElementType.STYLE:
        var textContent = '';
        ast.children.forEach(child => {
          if (child instanceof HtmlTextAst) {
            textContent += (<HtmlTextAst>child).value;
          }
        });
        this.styles.push(textContent);
        break;
      case PreparsedElementType.STYLESHEET:
        this.styleUrls.push(preparsedElement.hrefAttr);
        break;
    }
    if (preparsedElement.type !== PreparsedElementType.NON_BINDABLE) {
      htmlVisitAll(this, ast.children);
    }
    return null;
  }
  visitAttr(ast: HtmlAttrAst, context: any): any { return null; }
  visitText(ast: HtmlTextAst, context: any): any { return null; }
}
