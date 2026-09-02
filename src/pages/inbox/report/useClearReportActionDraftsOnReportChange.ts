import usePrevious from '@hooks/usePrevious';

import {clearAllReportActionDrafts} from '@libs/actions/Report';

import {useEffect} from 'react';

// When a mounted report screen switches to a different report, clear all report action edit drafts. Mounting and
// leaving the screen must not clear drafts, otherwise an edit in progress is lost when the user navigates away and
// back to the same report.
function useClearReportActionDraftsOnReportChange(reportID: string | undefined) {
    const prevReportID = usePrevious(reportID);
    useEffect(() => {
        if (!prevReportID || prevReportID === reportID) {
            return;
        }
        clearAllReportActionDrafts();
    }, [reportID, prevReportID]);
}

export default useClearReportActionDraftsOnReportChange;
