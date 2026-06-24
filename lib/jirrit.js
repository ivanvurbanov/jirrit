(function(){

	/* Scoped Variables */

	let localChanges = [];

	let localHostName = 'http://gerrit.mobile-systemsbg.com';

	let localUser = '';
	let localPass = '';

	let mostRecentUrl = '';

	let mostRecentJiraKey = '';

	let mostRecentGerritResponse = null;

	let currentPopupType = null;

	let sortField = null;
	let sortDir = 1;


	/* Listen for URL Changes */

	setInterval(() => {
		if (mostRecentUrl != window.location.href){
			mostRecentUrl = window.location.href;
			clearLocalChanges();
			/* Keep the settings form open while editing; JIRA's SPA mutates the URL */
			if (currentPopupType !== 'settings'){ toggleOffNativePopup(); }
			fetchChangesIfJiraKeyDetected();
			clearLastGerritResponse();
		}
	}, 500);


	/* Listen for Clicks */

	document.addEventListener('click', event => {
		const popup = document.getElementById('gerrit-jira-popup');

		//fetchChangesIfJiraKeyDetected();
		if (popup){
			/* Clicking a sortable column header */
			const sortHeader = event.target.closest?.('.gerrit-jira-sort');
			/* Clicking X, Clicking Outside Popup*/
			const clickedClose = event.target.classList.contains('gerrit-jira-close-button')
				|| event.target.classList.contains('gerrit-jira-close-button-img');
			/* Don't dismiss the settings form on outside clicks (e.g. password-manager UI) */
			const clickedOutside = !popup.contains(event.target)
				&& currentPopupType !== 'settings';

			if (sortHeader && popup.contains(sortHeader))
			{
				sortChanges(sortHeader.dataset.sortField, sortHeader.dataset.sortType);
				popup.innerHTML = getChangeListPopupContent();
			}
			else if (clickedClose || clickedOutside)
			{
				toggleOffNativePopup();
			}
			/* Clicking Settings Wheel */
			else if (
				event.target.classList.contains('gerrit-jira-settings-button')
				|| event.target.classList.contains('gerrit-jira-settings-button-img')
			)
			{
				toggleOffNativePopup();
				toggleNativePopup('settings');
			}
		}
	});


	/* Listen for Settings Form Submit */

	document.addEventListener('submit', event => {
		if (event.target?.classList?.contains('gerrit-jira-settings-form')){
			event.preventDefault();
			const hostname = document.getElementById('gerrit-jira-gerrit-host-input').value;
			const username = document.getElementById('gerrit-jira-gerrit-user-input').value;
			const pass = document.getElementById('gerrit-jira-gerrit-pass-input').value;
			setGerritHost(hostname, username, pass);
			toggleOffNativePopup();
		}
	});


	/* Listen For Messages */

	chrome.runtime.onMessage.addListener( message => {
		switch (message['type']){
			case 'toggleNativePopup':
				storeLocalHostName(message.host, message.user, message.pass);
				toggleNativePopupBasedOnLocalState();
				break;
			case 'setLastGerritResponse':
				storeLastGerritResponse(message.status);
				break;
			case 'activeTabChange':
				toggleOffNativePopup();
				fetchChangesIfJiraKeyDetected();
				break;
			case 'purgeLocalChanges':
				clearLocalChanges(false);
				break;
		}
	});


	/* Fetch Gerrit Changes */

	function fetchChangesIfJiraKeyDetected(){
		//console.log("!!!!!! fetchChangesIfJiraKeyDetected");
		const currentUrl = window.location.href;
		const selectedPattern = /(?<=browse\/)[A-Z]*-[0-9]*/;
		const browsePattern = /(?<=selectedIssue=)[A-Z]*-[0-9]*/;
		const jiraKey = currentUrl.match(selectedPattern) || currentUrl.match(browsePattern);

		//console.log("!!!!!! JiraKey "+jiraKey);
	
		if (jiraKey){
			mostRecentJiraKey = jiraKey;

			chrome.runtime.sendMessage({
				type: 'tryGetChangesByJiraKey',
				jiraKey: jiraKey
			}, storeLocalChanges);
			
		}
	}


async function getGerritHost(){
	const data = await chrome.storage.local.get(['gerritHost']);
	return data['gerritHost'];
}

async function getGerritUser(){
	const data = await chrome.storage.local.get(['gerritUser']);
	return data['gerritUser'];
}

async function getGerritPass(){
	const data = await chrome.storage.local.get(['gerritPass']);
	return data['gerritPass'];
}

async function setGerritHost(host, user, pass, tabId, sendResponse){
	await chrome.storage.local.set({ gerritHost: host, gerritUser: user, gerritPass: pass });
	//sendResponse();
	//setListBadge('', tabId);
}


	/* Local Changes */

	function storeLocalHostName(hostName, user, pass){
		localHostName = (hostName || '').replace(/\/+$/, '');
		localUser = user;
		localPass = pass;
	}

	function storeLocalChanges(fetchedChanges){
		localChanges = fetchedChanges;
		sortField = null;
		sortDir = 1;
		setBadgeToLength(localChanges.length);
	}

	function sortChanges(field, type){
		if (sortField === field){
			sortDir = -sortDir;
		}else{
			sortField = field;
			sortDir = 1;
		}
		localChanges.sort((a, b) => {
			if (type === 'number'){
				return ((Number(a[field]) || 0) - (Number(b[field]) || 0)) * sortDir;
			}
			const av = (a[field] ?? '').toString().toLowerCase();
			const bv = (b[field] ?? '').toString().toLowerCase();
			return av.localeCompare(bv) * sortDir;
		});
	}

	function clearLocalChanges(clearBadge = true){
		localChanges = [];
		if (clearBadge){ setBadgeToLength(0); }
	}

	function storeLastGerritResponse(status){
		mostRecentGerritResponse = status;
	}

	function clearLastGerritResponse(){
		mostRecentGerritResponse = null;
	}

	/* Set Gerrit Host */

	function setGerritHost(hostname, username, pass){
		chrome.runtime.sendMessage({
			type: 'setGerritHost',
			host: hostname,
			user: username,
			pass: pass
		}, fetchChangesIfJiraKeyDetected);
	}


	/* Set Badge */

	function setBadgeToLength(length){
		chrome.runtime.sendMessage({
			type: 'setListBadge',
			value: length
		});
	}
	

	/* Toggle Native Popup */

	function toggleNativePopupBasedOnLocalState(){
		if (!localHostName) {
			toggleNativePopup('settings');
		}else if (localChanges?.length > 0){
			toggleNativePopup('list');
		}else if (mostRecentGerritResponse !== null){
			toggleNativePopup('debug');
		}else{
			toggleNativePopup('ticketless');
		}
	}

	function toggleNativePopup(type){
		const popup = document.getElementById('gerrit-jira-popup');

		if (popup){
			popup.remove();
			currentPopupType = null;
		}else{
			renderNativePopup(type);
		}
	}

	function toggleOffNativePopup(){
		const popup = document.getElementById('gerrit-jira-popup');
		if (popup) { popup.remove(); }
		currentPopupType = null;
	}


	/* Render Change List Popup */

	function renderNativePopup(type){
		const div = document.createElement('div');

		div.id = 'gerrit-jira-popup';

		div.innerHTML = type === 'list' 
			? getChangeListPopupContent()
			: type === 'settings'
			? getSettingsPopupContent()
			: type === 'debug'
			? getDebugPopupContent()
			: getTicketlessPopupContent();

		document.body.appendChild(div);

		currentPopupType = type;
	}


	function getChangeListPopupContent(){
		const iconUrl = chrome.runtime.getURL('media/gerrit16.png');
		const gearUrl = chrome.runtime.getURL('media/gear48.png');
		const xUrl = chrome.runtime.getURL('media/close48.png');

		const columns = [
			{ field: 'subject',    label: 'Change', type: 'string', cls: '' },
			{ field: 'project',    label: 'Repo',   type: 'string', cls: 'gerrit-jira-change-repo' },
			{ field: 'status',     label: 'Status', type: 'string', cls: 'gerrit-jira-change-status' },
			{ field: 'insertions', label: '+',      type: 'number', cls: 'gerrit-jira-change-insertions' },
			{ field: 'deletions',  label: '-',      type: 'number', cls: 'gerrit-jira-change-deletions' }
		];

		const headerCells = columns.map(col => {
			const arrow = sortField === col.field ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
			return `<th class="gerrit-jira-sort ${col.cls}" data-sort-field="${col.field}" data-sort-type="${col.type}">${col.label}${arrow}</th>`;
		}).join('');

		let html = `
			<div class="gerrit-jira-popup-content">
				<div class="gerrit-jira-title">
					<b>Gerrit Changes Linked to ${mostRecentJiraKey}</b>
				</div>
				<div class="gerrit-jira-close-button">
					<img class="gerrit-jira-close-button-img" src="${xUrl}" />
				</div>
				<div class="gerrit-jira-settings-button">
					<img class="gerrit-jira-settings-button-img" src="${gearUrl}" />
				</div>
				<div class="gerrit-jira-change-list">
				<table>
					<thead>
						<tr>
							<th class="gerrit-jira-gerrit-icon"></th>
							${headerCells}
						</tr>
					</thead>
					<tbody>
		`;

		localChanges.forEach(change => {
			html += `
					<tr>
					<td class="gerrit-jira-gerrit-icon">
							<img src="${iconUrl}" />
						</td>
						<td>
							<b>
								<a 
									class="gerrit-jira-change-link"
									target="_blank"
									href="${localHostName}/#/c/${change._number}/"
								>
									<b>${change.subject}</b>
								</a>
							</b>
						</td>
						<td class="gerrit-jira-change-repo">
							<b>(${change.project})</b>
						</td>
						<td class="gerrit-jira-change-status">
							<b>${change.status}</b>
						</td>
						<td class="gerrit-jira-change-insertions">
							<b>+${change.insertions}</b>
						</td>
						<td class="gerrit-jira-change-deletions">
							<b>-${change.deletions}</b>
						</td>
					</tr>
			`
		});

		html += `
					</tbody>
				</table>
				</div>
			</div>
		`;

		return html;
	}

	function getDebugPopupContent(){
		const gearUrl = chrome.runtime.getURL('media/gear48.png');
		const debugUrl = chrome.runtime.getURL('media/debug48.png');
		const xUrl = chrome.runtime.getURL('media/close48.png');
		const redUrl = chrome.runtime.getURL('media/red48.png');
		const greenUrl = chrome.runtime.getURL('media/green48.png');

		const hint = getHintByStatus(mostRecentGerritResponse);
		const statusMessage = getStatusMessageByStatus(mostRecentGerritResponse);

		return html = `
			<div class="gerrit-jira-popup-content">
				<div class="gerrit-jira-title">
					<img class="gerrit-jira-debug-icon-img" src="${debugUrl}" />
					<b>Last Response from ${localHostName ?? 'Gerrit'}: </b>
				</div>
				<div class="gerrit-jira-recent-status">
					<img class="gerrit-jira-status-icon-img" src="${mostRecentGerritResponse === 200 ? greenUrl : redUrl}" />	
					<b>${mostRecentGerritResponse === 0 ? 'Connection Failed' : mostRecentGerritResponse}${!!statusMessage ? `: ${statusMessage}` : ''}</b>
					<span class="gerrit-jira-status-hint">${hint}</span>
				</div>
				<div class="gerrit-jira-close-button">
					<img class="gerrit-jira-close-button-img" src="${xUrl}" />
				</div>
				<div class="gerrit-jira-settings-button">
					<img class="gerrit-jira-settings-button-img" src="${gearUrl}" />
				</div>
			</div>
		`;
	}

	function getSettingsPopupContent(){
		const iconUrl = chrome.runtime.getURL('media/gerrit16.png');
		const gearUrl = chrome.runtime.getURL('media/gear48.png');
		const xUrl = chrome.runtime.getURL('media/close48.png');

		return html = `
			<div class="gerrit-jira-popup-content">
				<div class="gerrit-jira-title">
					<img class="gerrit-jira-settings-title-icon" src="${gearUrl}" />
					<b class="gerrit-jira-settings-title-text">Settings</b>
				</div>
				<div class="gerrit-jira-close-button">
					<img class="gerrit-jira-close-button-img" src="${xUrl}" />
				</div>

				<form class="gerrit-jira-settings-form">
					<div class="gerrit-jira-settings-panel">
						<img class="gerrit-jira-gerrit-icon" src="${iconUrl}" />
						<b class="gerrit-jira-gerrit-host-label">Gerrit Host:</b>
						<input id="gerrit-jira-gerrit-host-input" name="gerrit-host" type="text" autocomplete="off" value="${localHostName ?? ''}" placeholder="your.gerrit.host"/>
					</div>
					<div class="gerrit-jira-settings-panel">
						<img class="gerrit-jira-gerrit-icon" src="${iconUrl}" />
						<b class="gerrit-jira-gerrit-host-label">Gerrit user:</b>
						<input id="gerrit-jira-gerrit-user-input" name="username" type="text" autocomplete="username" value="${localUser ?? ''}" placeholder="your.gerrit.user"/>
					</div>
					<div class="gerrit-jira-settings-panel">
						<img class="gerrit-jira-gerrit-icon" src="${iconUrl}" />
						<b class="gerrit-jira-gerrit-host-label">Gerrit pass:</b>
						<input id="gerrit-jira-gerrit-pass-input" name="password" type="password" autocomplete="current-password" value="${localPass ?? ''}" placeholder="your.gerrit.pass"/>
					</div>
					<div class="gerrit-jira-settings-panel">
						<button class="gerrit-jira-settings-submit-button" type="submit">Save</button>
					</div>
				</form>
			</div>
		`;
	}

	function getTicketlessPopupContent(){
		const searchUrl = chrome.runtime.getURL('media/search48.png');
		const gearUrl = chrome.runtime.getURL('media/gear48.png');
		const xUrl = chrome.runtime.getURL('media/close48.png');

		return html = `
			<div class="gerrit-jira-popup-content">
				<div class="gerrit-jira-title">
					<img class="gerrit-jira-debug-icon-img" src="${searchUrl}" />
					<b>No JIRA Ticket detected in URL.</b>
				</div>
				<div class="gerrit-jira-close-button">
					<img class="gerrit-jira-close-button-img" src="${xUrl}" />
				</div>
				<div class="gerrit-jira-settings-button">
					<img class="gerrit-jira-settings-button-img" src="${gearUrl}" />
				</div>
			</div>
		`;
	}

	function getStatusMessageByStatus(status){
		switch (status) {
			case 200:
				return 'OK';
			case 401:
				return 'Unauthorized';
			case 403:
				return 'Forbidden';
			case 404:
				return 'Not Found';
			case 500:
				return 'Internal Server Error';
			default:
				return null;
		}
	}

	function getHintByStatus(status){
		switch (status) {
			case 200:
				return 'No Results Found.';
			case 401:
				return 'You may need to log in to Gerrit.';
			case 403:
				return 'You may need to log in to Gerrit.';
			case 404:
				return 'Check the Gerrit host in settings.';
			case 0:
				return 'Gerrit was not reachable at the specified host.'
			default:
				return '';
		}
	}
})();