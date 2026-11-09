import {endSpan, getSpan, getSpanByPrefix, startSpan} from '@libs/telemetry/activeSpans';

import CONST from '@src/CONST';

import type {Span, StartSpanOptions} from '@sentry/core';

type MockInactiveSpan = {
    setAttribute: jest.Mock<void, Parameters<Span['setAttribute']>>;
    setStatus: jest.Mock<void, Parameters<Span['setStatus']>>;
    end: jest.Mock<void, Parameters<Span['end']>>;
};

const mockStartInactiveSpan = jest.fn<MockInactiveSpan, [StartSpanOptions]>(() => ({
    setAttribute: jest.fn<void, Parameters<Span['setAttribute']>>(),
    setStatus: jest.fn<void, Parameters<Span['setStatus']>>(),
    end: jest.fn<void, Parameters<Span['end']>>(),
}));

const mockAddBreadcrumb = jest.fn<void, [{category: string; message: string}]>();
const mockSetContext = jest.fn<void, [string, Record<string, unknown>]>();

jest.mock('@libs/telemetry/logBenchmarkSpanEnd', () => ({
    __esModule: true,
    default: jest.fn(),
    isBenchmarkSpanEnabled: () => false,
}));
jest.mock('@sentry/react-native', () => ({
    startInactiveSpan: (options: StartSpanOptions) => mockStartInactiveSpan(options),
    spanToJSON: () => ({data: {}}),
    addBreadcrumb: (breadcrumb: {category: string; message: string}) => mockAddBreadcrumb(breadcrumb),
    setContext: (key: string, context: Record<string, unknown>) => mockSetContext(key, context),
}));

afterEach(() => {
    jest.restoreAllMocks();
    mockStartInactiveSpan.mockClear();
    mockAddBreadcrumb.mockClear();
    mockSetContext.mockClear();
});

describe('activeSpans', () => {
    it('calculates the duration from an epoch start time using the monotonic clock', () => {
        const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_786_362_201_500);
        const performanceNowSpy = jest.spyOn(performance, 'now').mockReturnValue(10_000);
        const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

        startSpan(CONST.TELEMETRY.SPAN_APP_STARTUP_NETWORK_REQUEST, {
            name: CONST.TELEMETRY.SPAN_APP_STARTUP_NETWORK_REQUEST,
            startTime: 1_786_362_201_000,
        });

        dateNowSpy.mockReturnValue(1_786_362_201_750);
        performanceNowSpy.mockReturnValue(10_250);
        endSpan(CONST.TELEMETRY.SPAN_APP_STARTUP_NETWORK_REQUEST);

        expect(consoleDebugSpy).toHaveBeenLastCalledWith(expect.stringContaining('Ending span (750ms)'), expect.objectContaining({durationMs: 750, timestamp: 1_786_362_201_750}));
    });
    describe('span parenting', () => {
        beforeEach(() => {
            jest.spyOn(console, 'debug').mockImplementation(() => {});
        });

        it('forces a span with no declared parent into its own transaction', () => {
            // Given options from a caller that names no parent, which is how almost every span in the app is started
            const options = {name: 'RootedSpan'};

            // When the span is started
            startSpan('RootedSpan', options);

            // Then it is forced into its own transaction, because a child can be ended by whatever span sits on the scope
            expect(mockStartInactiveSpan).toHaveBeenCalledWith(expect.objectContaining({name: 'RootedSpan', forceTransaction: true}));

            endSpan('RootedSpan');
        });

        it('keeps a parent the caller declared', () => {
            // Given another tracked span used as a parent, the way the send-message phases nest under the visible span
            startSpan('ParentSpan', {name: 'ParentSpan'});
            const parentSpan = getSpan('ParentSpan');

            // When the span is started
            startSpan('NestedSpan', {name: 'NestedSpan', parentSpan});

            // Then it stays a child of that parent, so deliberate nesting is not broken
            expect(mockStartInactiveSpan).toHaveBeenCalledWith(expect.objectContaining({name: 'NestedSpan', parentSpan, forceTransaction: false}));

            endSpan('NestedSpan');
            endSpan('ParentSpan');
        });

        it('keeps a caller that opts back into the span on the scope', () => {
            // Given a caller that passes forceTransaction: false, as the Onyx derived recomputes do because they are short and want whatever transaction is open
            const options = {name: 'InheritingSpan', forceTransaction: false};

            // When the span is started
            startSpan('InheritingSpan', options);

            // Then the caller's choice wins over the no-parent default, so the span is left as a child
            expect(mockStartInactiveSpan).toHaveBeenCalledWith({name: 'InheritingSpan', forceTransaction: false});

            endSpan('InheritingSpan');
        });
    });
    describe('operation context', () => {
        beforeEach(() => {
            jest.spyOn(console, 'debug').mockImplementation(() => {});
        });

        it('publishes a tracked operation while it runs and records when it ended', () => {
            // Given app startup, one of the operations a native app hang should be able to name
            startSpan(CONST.TELEMETRY.SPAN_APP_STARTUP, {name: CONST.TELEMETRY.SPAN_APP_STARTUP});

            // Then the scope lists it as active, so a hang detected now carries it
            expect(mockSetContext).toHaveBeenLastCalledWith(CONST.TELEMETRY.CONTEXT_ACTIVE_OPERATIONS, {
                operations: [expect.objectContaining({name: CONST.TELEMETRY.SPAN_APP_STARTUP})],
            });

            // When it ends
            endSpan(CONST.TELEMETRY.SPAN_APP_STARTUP);

            // Then it is no longer active, and a breadcrumb keeps it for a hang detected just after
            expect(mockSetContext).toHaveBeenLastCalledWith(CONST.TELEMETRY.CONTEXT_ACTIVE_OPERATIONS, {operations: []});
            expect(mockAddBreadcrumb.mock.lastCall?.[0].category).toBe('operation');
            expect(mockAddBreadcrumb.mock.lastCall?.[0].message).toContain(`Ended ${CONST.TELEMETRY.SPAN_APP_STARTUP}`);
        });

        it('keeps an overlapping operation active when another one ends', () => {
            // Given a startup data phase and a report opening running at the same time
            startSpan(CONST.TELEMETRY.SPAN_STARTUP_DATA.APPLY, {name: CONST.TELEMETRY.SPAN_STARTUP_DATA.APPLY});
            startSpan(CONST.TELEMETRY.SPAN_OPEN_REPORT, {name: CONST.TELEMETRY.SPAN_OPEN_REPORT});

            // When the startup phase ends
            endSpan(CONST.TELEMETRY.SPAN_STARTUP_DATA.APPLY);

            // Then only the report opening is still listed
            expect(mockSetContext).toHaveBeenLastCalledWith(CONST.TELEMETRY.CONTEXT_ACTIVE_OPERATIONS, {
                operations: [expect.objectContaining({name: CONST.TELEMETRY.SPAN_OPEN_REPORT})],
            });

            endSpan(CONST.TELEMETRY.SPAN_OPEN_REPORT);
        });

        it('leaves the scope alone for operations outside the list', () => {
            // When a span that is not a tracked operation starts and ends
            startSpan('SomethingElse', {name: 'SomethingElse'});
            endSpan('SomethingElse');

            // Then nothing is published, so the context only ever names the fixed operations
            expect(mockSetContext).not.toHaveBeenCalled();
            expect(mockAddBreadcrumb).not.toHaveBeenCalled();
        });
    });
    describe('getSpanByPrefix', () => {
        const prefix = CONST.TELEMETRY.SPAN_STARTUP_DATA.APPLY;

        beforeEach(() => {
            jest.spyOn(console, 'debug').mockImplementation(() => {});
        });

        it('returns nothing when no span id matches', () => {
            const span = startSpan('SomethingElse', {name: 'SomethingElse'});

            expect(getSpanByPrefix(prefix)).toBeUndefined();

            endSpan('SomethingElse');
            expect(span).toBeDefined();
        });

        it('finds a span stored under a suffixed id', () => {
            const span = startSpan(`${prefix}_1`, {name: prefix});

            expect(getSpanByPrefix(prefix)).toBe(span);

            endSpan(`${prefix}_1`);
            expect(getSpanByPrefix(prefix)).toBeUndefined();
        });

        it('returns the earliest attempt when several are active', () => {
            const firstAttempt = startSpan(`${prefix}_1`, {name: prefix});
            startSpan(`${prefix}_2`, {name: prefix});

            expect(getSpanByPrefix(prefix)).toBe(firstAttempt);

            endSpan(`${prefix}_1`);
            endSpan(`${prefix}_2`);
        });
    });
});
