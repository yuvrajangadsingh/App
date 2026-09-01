import {act, render} from '@testing-library/react-native';

import ComposeProviders from '@components/ComposeProviders';
import {CurrentUserPersonalDetailsProvider} from '@components/CurrentUserPersonalDetailsProvider';
import {LocaleContextProvider} from '@components/LocaleContextProvider';
import OnyxListItemProvider from '@components/OnyxListItemProvider';
import Text from '@components/Text';

import withAgentAccessDenied from '@libs/Navigation/AppNavigator/withAgentAccessDenied';
import Navigation from '@libs/Navigation/Navigation';

import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';

import type * as NativeNavigation from '@react-navigation/native';

import React from 'react';
import Onyx from 'react-native-onyx';

import * as TestHelper from '../utils/TestHelper';
import waitForBatchedUpdatesWithAct from '../utils/waitForBatchedUpdatesWithAct';

// Models the real DISMISS_MODAL semantics: React Navigation publishes the new state synchronously
// (useOnAction), so the instant dismissModal runs, isTopmostRouteModalScreen already reports false
// for everyone who asks after it, even though the RHP is still animating out.
let mockModalDismissed = false;
let mockAfterTransition: (() => void) | undefined;

jest.mock('@libs/Navigation/Navigation', () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    dismissModal: jest.fn(({afterTransition}: {afterTransition?: () => void} = {}) => {
        mockModalDismissed = true;
        mockAfterTransition = afterTransition;
    }),
    getActiveRoute: jest.fn(() => ''),
    isActiveRoute: jest.fn(() => false),
    isTopmostRouteModalScreen: jest.fn(() => !mockModalDismissed),
    isNavigationReady: jest.fn(() => Promise.resolve()),
}));

// Two guarded screens are mounted at once in the copilot flow (the Agents central pane and the
// agent-edit RHP), with different focus states. A per-tree context lets each instance report its
// own focus to both useIsFocused and useFocusEffect.
jest.mock('@react-navigation/native', () => {
    const actualNav = jest.requireActual<typeof NativeNavigation>('@react-navigation/native');
    const react = jest.requireActual<typeof React>('react');
    const FocusContext = react.createContext(true);
    return {
        ...actualNav,
        mockFocusContext: FocusContext,
        useFocusEffect: (effect: React.EffectCallback) => {
            const isFocused = react.useContext(FocusContext);
            react.useEffect(() => {
                if (!isFocused) {
                    return;
                }
                return effect();
            }, [effect, isFocused]);
        },
        useIsFocused: () => react.useContext(FocusContext),
    };
});

jest.mock('@hooks/useResponsiveLayout', () => () => ({shouldUseNarrowLayout: false}));

const {mockFocusContext: FocusContext} = jest.requireMock<{mockFocusContext: React.Context<boolean>}>('@react-navigation/native');

function AgentsPaneContent() {
    return <Text testID="agents-pane">Agents</Text>;
}

function EditAgentContent() {
    return <Text testID="edit-agent-rhp">Edit agent</Text>;
}

// Two distinct wrapper instances, exactly as SettingsSplitNavigator (central pane) and the
// ModalStackNavigators (RHP) create them.
const getAgentsPane = withAgentAccessDenied(() => AgentsPaneContent);
const getEditAgentRhp = withAgentAccessDenied(() => EditAgentContent);

function renderCopilotFlow() {
    const AgentsPane = getAgentsPane();
    const EditAgentRhp = getEditAgentRhp();
    return render(
        <ComposeProviders components={[OnyxListItemProvider, CurrentUserPersonalDetailsProvider, LocaleContextProvider]}>
            <FocusContext.Provider value={false}>
                <AgentsPane />
            </FocusContext.Provider>
            <FocusContext.Provider value>
                <EditAgentRhp />
            </FocusContext.Provider>
        </ComposeProviders>,
    );
}

async function signInAsAgent() {
    const accountID = 1;
    await TestHelper.signInWithTestUser(accountID, 'testbot_123@expensify.ai');
    await Onyx.set(ONYXKEYS.IS_LOADING_APP, false);
    await Onyx.merge(ONYXKEYS.PERSONAL_DETAILS_LIST, {
        [accountID]: {
            accountID,
            login: 'testbot_123@expensify.ai',
            isCustomAgent: true,
        },
    });
}

describe('withAgentAccessDenied with two mounted guarded screens', () => {
    beforeAll(async () => {
        Onyx.init({keys: ONYXKEYS});
        await act(async () => {
            await Onyx.set(ONYXKEYS.NVP_PREFERRED_LOCALE, 'en' as const);
        });
        await waitForBatchedUpdatesWithAct();
    });

    afterEach(async () => {
        await Onyx.clear();
        await waitForBatchedUpdatesWithAct();
    });

    beforeEach(() => {
        mockModalDismissed = false;
        mockAfterTransition = undefined;
        jest.mocked(Navigation.navigate).mockClear();
        jest.mocked(Navigation.dismissModal).mockClear();
        jest.mocked(Navigation.isActiveRoute).mockReturnValue(false);
    });

    it('redirects exactly once and only after the RHP transition when the session flips to an agent', async () => {
        // Owner is on the agent-edit RHP (focused) over the Agents central pane (mounted, unfocused)
        // and taps "Copilot into account". Both guarded instances see isAgent flip to true.
        renderCopilotFlow();
        await waitForBatchedUpdatesWithAct();

        await signInAsAgent();
        await waitForBatchedUpdatesWithAct();

        // The RHP is the topmost modal, so the redirect must go through dismissModal and defer
        // Profile to afterTransition. One dismissal for the whole flow.
        expect(Navigation.dismissModal).toHaveBeenCalledTimes(1);
        expect(mockAfterTransition).toEqual(expect.any(Function));

        // Nothing may navigate before the transition finishes. On the unfixed HOC this fails: the
        // second instance's continuation runs after the first has already dispatched DISMISS_MODAL,
        // sees no modal on top, and navigates to Profile immediately, while the RHP is still mid
        // exit animation. That early Profile is what makes the dismissing RHP paint "Not so fast".
        expect(Navigation.navigate).not.toHaveBeenCalled();

        act(() => {
            mockAfterTransition?.();
        });

        expect(Navigation.navigate).toHaveBeenCalledTimes(1);
        expect(Navigation.navigate).toHaveBeenCalledWith(ROUTES.SETTINGS_PROFILE.getRoute(), {forceReplace: true});
    });
});
