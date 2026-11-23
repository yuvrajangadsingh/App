import useLocalize from '@hooks/useLocalize';
import useOnyx from '@hooks/useOnyx';
import useThemeStyles from '@hooks/useThemeStyles';

import {clearOnyxAndResetApp} from '@libs/actions/App';
import {setShouldFailAllRequests} from '@libs/actions/Network';
import {resetAllChecks} from '@libs/actions/Welcome';

import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';

import {shouldFailAllRequestsSelector} from '@selectors/Network';
import React from 'react';
import {View} from 'react-native';

import Button from './Button';

function ImportedStateIndicator() {
    const styles = useThemeStyles();
    const {translate} = useLocalize();
    const [isUsingImportedState] = useOnyx(ONYXKEYS.IS_USING_IMPORTED_STATE);
    const [shouldFailAllRequests] = useOnyx(ONYXKEYS.NETWORK, {selector: shouldFailAllRequestsSelector});

    if (!isUsingImportedState && !shouldFailAllRequests) {
        return null;
    }

    return (
        <View style={[styles.buttonDanger]}>
            {!!shouldFailAllRequests && (
                <Button
                    sentryLabel={CONST.SENTRY_LABEL.FAILING_REQUESTS_INDICATOR.TURN_OFF}
                    variant={CONST.BUTTON_VARIANT.DANGER}
                    size={CONST.BUTTON_SIZE.SMALL}
                    removeBorderRadius={CONST.BUTTON_REMOVE_BORDER_RADIUS.ALL}
                    onPress={() => setShouldFailAllRequests(false)}
                >
                    <Button.Text style={[styles.fontWeightNormal]}>{translate('initialSettingsPage.troubleshoot.failingRequests')}</Button.Text>
                </Button>
            )}
            {!!isUsingImportedState && (
                <Button
                    sentryLabel={CONST.SENTRY_LABEL.IMPORTED_STATE_INDICATOR.RESET}
                    variant={CONST.BUTTON_VARIANT.DANGER}
                    size={CONST.BUTTON_SIZE.SMALL}
                    removeBorderRadius={CONST.BUTTON_REMOVE_BORDER_RADIUS.ALL}
                    onPress={() => {
                        // The cleared state has no Concierge reportID, so opening Concierge must wait for OpenApp instead of creating a duplicate chat
                        resetAllChecks(true);
                        clearOnyxAndResetApp(true);
                    }}
                >
                    <Button.Text style={[styles.fontWeightNormal]}>{translate('initialSettingsPage.troubleshoot.usingImportedState')}</Button.Text>
                </Button>
            )}
        </View>
    );
}

export default ImportedStateIndicator;
