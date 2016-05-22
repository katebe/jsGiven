// @flow
import {Stage} from './Stage';
import type {GroupFunc, TestFunc} from './test-runners';

import _ from 'lodash';
import humanize from 'string-humanize';

type ScenariosParam<G, W, T> = {
    given: () => G;
    when: () => W;
    then: () => T;
}

type ScenariosFunc<G, W, T> = {
    (scenariosParam: ScenariosParam<G, W, T>): {[key:string]: ScenarioFunc};
}

export type ScenarioFunc = {
    (): void;
}

type ScenarioReport = {
    name: string;

}

type GroupReport = {
    name: string;
    scenarios: ScenarioReport[];
}

export class ScenarioRunner {
    groupFunc: GroupFunc;
    testFunc: TestFunc;
    report: ?GroupReport;

    setup(groupFunc: GroupFunc, testFunc: TestFunc): void {
        this.groupFunc = groupFunc;
        this.testFunc = testFunc;
    }

    scenarios<G: Stage, W: Stage, T: Stage>(groupName: string, givenClass: Class<G>, whenClass: Class<W>, thenClass: Class<T>, scenariosFunc: ScenariosFunc<G, W, T>) {
        let currentGiven: ?G;
        let currentWhen: ?W;
        let currentThen: ?T;

        function getOrBuildGiven(): G {
            if (!currentGiven) {
                currentGiven = buildObject(givenClass);
            }
            return currentGiven.given();
        }

        function getOrBuildWhen(): W {
            if (!currentWhen) {
                currentWhen = buildObject(whenClass);
                copyStateProperties(currentGiven, currentWhen);
            }
            return currentWhen.when();
        }

        function getOrBuildThen(): T {
            if (!currentThen) {
                currentThen = buildObject(thenClass);
                copyStateProperties(currentGiven, currentThen);
                copyStateProperties(currentWhen, currentThen);
            }
            return currentThen.then();
        }

        const givenParam: ScenariosParam<G, W, T> = {
            given: getOrBuildGiven,
            when: getOrBuildWhen,
            then: getOrBuildThen
        };

        const humanizedGroupName = humanize(groupName);

        this.report = {
            name: humanizedGroupName,
            scenarios: []
        }

        this.groupFunc(humanizedGroupName, () => {
            const scenarios = scenariosFunc(givenParam);

            _.functions(scenarios).forEach(scenarioName => {
                const scenarioNameForHumans = humanize(scenarioName);
                this.testFunc(scenarioNameForHumans, () => {
                    // Reset stages
                    currentGiven = currentWhen = currentThen = undefined;
                    try {
                        // Execute scenario
                        scenarios[scenarioName]();
                    } finally {
                        if (this.report) {
                            this.report.scenarios.push({name: scenarioNameForHumans});
                        }
                    }
                })
            });
        });
    }
}

function buildObject<T>(tClass: Class<T>): T {
    class extendedClass extends tClass {};

    // Flowtype really can't type this constructor invocation
    // Therefore we have to cast it as any :(
    const extendedClassConstructor: any = extendedClass;
    const instance = new extendedClassConstructor();

    const extendedPrototype = Object.getPrototypeOf(instance);
    const classPrototype = Object.getPrototypeOf(extendedPrototype);

    getAllMethods(classPrototype).forEach((methodName) => {
        extendedPrototype[methodName] = function(...args) {
            return classPrototype[methodName].apply(this, ...args);
        }
    });

    return instance;

    function getAllMethods(obj: any): string[] {
        let allProps: string[] = [];
        let current = obj;
        do {
            let props = Object.getOwnPropertyNames(current)
            props.forEach(function(prop) {
                if (allProps.indexOf(prop) === -1) {
                    if(_.isFunction(current[prop])) {
                        allProps.push(prop);
                    }
                }
            });
        } while(current = Object.getPrototypeOf(current));

        return allProps;
    }
}

export const INSTANCE = new ScenarioRunner();

export function scenarios<G: Stage, W: Stage, T: Stage>(groupName: string, givenClass: Class<G>, whenClass: Class<W>, thenClass: Class<T>, scenarioFunc: ScenariosFunc<G, W, T>): void {
    return INSTANCE.scenarios(groupName, givenClass, whenClass, thenClass, scenarioFunc);
}

function copyStateProperties<S, T>(source: ?S, target: ?T): void {
    if (source && target && source.stateProperties && target.stateProperties) {
        const propertyNames = _.intersection(source.stateProperties, target.stateProperties);
        propertyNames.forEach(propertyName => {
            // Need to convert to any to avoid typechecking
            const sourceAny: any = source;
            const targetAny: any = target;
            targetAny[propertyName] = sourceAny[propertyName];
        });
    }
}

export function State(target: any, key: string, descriptor: any) {
    if (! target.stateProperties) {
        target.stateProperties = [];
    }
    target.stateProperties.push(key);
    return {...descriptor, writable: true};
}
