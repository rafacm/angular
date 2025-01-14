import {CompileTypeMetadata} from './directive_metadata';
import {SourceExpressions, moduleRef} from './source_module';
import {
  ChangeDetectorJITGenerator
} from 'angular2/src/core/change_detection/change_detection_jit_generator';

import {createChangeDetectorDefinitions} from './change_definition_factory';
import {isJsObject, CONST_EXPR} from 'angular2/src/core/facade/lang';

import {
  ChangeDetectorGenConfig,
  ChangeDetectorDefinition,
  DynamicProtoChangeDetector,
  ChangeDetectionStrategy
} from 'angular2/src/core/change_detection/change_detection';

import {TemplateAst} from './template_ast';
import {Codegen} from 'angular2/src/transform/template_compiler/change_detector_codegen';
import {IS_DART} from './util';
import {Injectable} from 'angular2/src/core/di';

const ABSTRACT_CHANGE_DETECTOR = "AbstractChangeDetector";
const UTIL = "ChangeDetectionUtil";

var ABSTRACT_CHANGE_DETECTOR_MODULE =
    moduleRef('angular2/src/core/change_detection/abstract_change_detector');
var UTIL_MODULE = moduleRef('angular2/src/core/change_detection/change_detection_util');
var PREGEN_PROTO_CHANGE_DETECTOR_MODULE =
    moduleRef('angular2/src/core/change_detection/pregen_proto_change_detector');

@Injectable()
export class ChangeDetectionCompiler {
  constructor(private _genConfig: ChangeDetectorGenConfig) {}

  compileComponentRuntime(componentType: CompileTypeMetadata, strategy: ChangeDetectionStrategy,
                          parsedTemplate: TemplateAst[]): Function[] {
    var changeDetectorDefinitions =
        createChangeDetectorDefinitions(componentType, strategy, this._genConfig, parsedTemplate);
    return changeDetectorDefinitions.map(definition =>
                                             this._createChangeDetectorFactory(definition));
  }

  private _createChangeDetectorFactory(definition: ChangeDetectorDefinition): Function {
    if (IS_DART) {
      var proto = new DynamicProtoChangeDetector(definition);
      return (dispatcher) => proto.instantiate(dispatcher);
    } else {
      // TODO(tbosch): provide a flag in _genConfig whether to allow eval or fall back to dynamic
      // change detection as well!
      return new ChangeDetectorJITGenerator(definition, UTIL, ABSTRACT_CHANGE_DETECTOR).generate();
    }
  }

  compileComponentCodeGen(componentType: CompileTypeMetadata, strategy: ChangeDetectionStrategy,
                          parsedTemplate: TemplateAst[]): SourceExpressions {
    var changeDetectorDefinitions =
        createChangeDetectorDefinitions(componentType, strategy, this._genConfig, parsedTemplate);
    var factories = [];
    var sourceParts = changeDetectorDefinitions.map(definition => {
      var codegen: any;
      // TODO(tbosch): move the 2 code generators to the same place, one with .dart and one with .ts
      // suffix
      // and have the same API for calling them!
      if (IS_DART) {
        codegen = new Codegen(PREGEN_PROTO_CHANGE_DETECTOR_MODULE);
        var className = definition.id;
        codegen.generate(componentType.name, className, definition);
        factories.push(`(dispatcher) => new ${className}(dispatcher)`);
        return codegen.toString();
      } else {
        codegen = new ChangeDetectorJITGenerator(
            definition, `${UTIL_MODULE}${UTIL}`,
            `${ABSTRACT_CHANGE_DETECTOR_MODULE}${ABSTRACT_CHANGE_DETECTOR}`);
        factories.push(`function(dispatcher) { return new ${codegen.typeName}(dispatcher); }`);
        return codegen.generateSource();
      }
    });
    return new SourceExpressions(sourceParts, factories);
  }
}
