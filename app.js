(() => {
  'use strict';
  const page = document.body.dataset.page;

  function server(method, ...args) {
    const config = window.APP_CONFIG || {};
    if (!config.apiUrl) return Promise.reject(new Error('尚未設定 GAS API 網址。'));
    return new Promise((resolve, reject) => {
      const requestId = 'rpc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      const frame = document.createElement('iframe');
      const form = document.createElement('form');
      const frameName = 'gas-rpc-' + requestId.replace(/[^a-z0-9-]/gi, '');
      let settled = false;

      frame.name = frameName;
      frame.title = 'GAS API 傳輸';
      frame.hidden = true;
      form.method = 'POST';
      form.action = config.apiUrl;
      form.target = frameName;
      form.hidden = true;

      [['rpcMethod', method], ['requestId', requestId], ['args', JSON.stringify(args)]].forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });

      const cleanup = () => {
        window.removeEventListener('message', receive);
        clearTimeout(timer);
        form.remove();
        frame.remove();
      };
      const receive = event => {
        const data = event.data;
        if (!data || data.channel !== 'qingzhi-gas-rpc-v1' || data.requestId !== requestId) return;
        settled = true;
        cleanup();
        resolve(data.result);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        cleanup();
        reject(new Error('後端回應逾時，請確認網路後再試。'));
      }, Number(config.apiTimeoutMs || 60000));

      window.addEventListener('message', receive);
      document.body.append(frame, form);
      form.submit();
    });
  }

  function money(value) {
    return new Intl.NumberFormat('zh-TW').format(Number(value || 0)) + ' 元';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  if (page === 'registration') initRegistration();
  if (page === 'report') initReport();

  function initRegistration() {
    const state = {
      config: null,
      memberCounter: 0,
      submissionKey: createSubmissionKey(),
      submitting: false,
      completed: false,
      earlyBirdTimer: null,
      earlyBirdRequestId: 0,
      insuranceByMember: {},
      confirmedRoomCapacityKey: '',
      pendingRoomCapacityKey: ''
    };
    const el = {
      form: document.getElementById('registrationForm'),
      participants: document.getElementById('participants'),
      addMember: document.getElementById('addAdultButton'),
      memberTemplate: document.getElementById('adultTemplate'),
      meetingOnly: document.getElementById('meetingOnly'),
      accommodationSection: document.getElementById('accommodationSection'),
      accommodation: document.getElementById('groupAccommodation'),
      roomField: document.getElementById('groupRoomField'),
      roomType: document.getElementById('groupRoomType'),
      hotelInfo: document.getElementById('groupHotelInfo'),
      personalRoomWarning: document.getElementById('personalRoomWarning'),
      personalRoomWarningText: document.getElementById('personalRoomWarningText'),
      personalRoomConfirm: document.getElementById('personalRoomConfirm'),
      transportCard: document.getElementById('transportCard'),
      travelCard: document.getElementById('travelCard'),
      insuranceSurvey: document.getElementById('insuranceSurvey'),
      insuranceTitle: document.getElementById('insuranceTitle'),
      insuranceDescription: document.getElementById('insuranceDescription'),
      insuranceParticipants: document.getElementById('insuranceParticipants'),
      routeSection: document.getElementById('routeSection'),
      routeId: document.getElementById('routeId'),
      routeInfo: document.getElementById('routeInfo'),
      routeDetailTable: document.getElementById('routeDetailTable'),
      routeOptions: document.getElementById('routeOptions'),
      route7Count: document.getElementById('route7Count'),
      onsiteTable: document.getElementById('onsiteTable'),
      pendingTable: document.getElementById('pendingTable'),
      grandTotal: document.getElementById('grandTotal'),
      feeDetails: document.getElementById('feeDetails'),
      toggleDetails: document.getElementById('toggleDetails'),
      onsiteReminder: document.getElementById('onsiteReminder'),
      submitButton: document.getElementById('submitButton'),
      email: document.getElementById('email'),
      globalMessage: document.getElementById('globalMessage'),
      dialog: document.getElementById('resultDialog'),
      resultEmail: document.getElementById('resultEmail'),
      resultEmailText: document.getElementById('resultEmailText'),
      resultFinancial: document.getElementById('resultFinancial'),
      resultFinancialText: document.getElementById('resultFinancialText'),
      resultRouteGroup: document.getElementById('resultRouteGroup'),
      resultRouteGroupTitle: document.getElementById('resultRouteGroupTitle'),
      resultRouteQr: document.getElementById('resultRouteQr'),
      resultRouteLink: document.getElementById('resultRouteLink'),
      roomCapacityDialog: document.getElementById('roomCapacityDialog'),
      groupRoomConfirm: document.getElementById('groupRoomConfirm'),
      changeRoomButton: document.getElementById('changeRoomButton'),
      confirmRoomButton: document.getElementById('confirmRoomButton')
    };

    bind();
    load();

    function bind() {
      el.form.addEventListener('input', handleChange);
      el.form.addEventListener('change', handleChange);
      el.form.addEventListener('submit', submit);
      el.addMember.addEventListener('click', () => addMember(false));
      el.participants.addEventListener('click', handleMemberClick);
      el.toggleDetails.addEventListener('click', () => {
        const open = el.feeDetails.hidden;
        el.feeDetails.hidden = !open;
        el.toggleDetails.setAttribute('aria-expanded', String(open));
      });
      document.getElementById('closeResult').addEventListener('click', () => el.dialog.close());
      el.groupRoomConfirm.addEventListener('change', () => {
        el.confirmRoomButton.disabled = !el.groupRoomConfirm.checked;
      });
      el.changeRoomButton.addEventListener('click', () => el.roomCapacityDialog.close());
      el.confirmRoomButton.addEventListener('click', () => {
        if (!el.groupRoomConfirm.checked || !state.pendingRoomCapacityKey) return;
        state.confirmedRoomCapacityKey = state.pendingRoomCapacityKey;
        state.pendingRoomCapacityKey = '';
        el.roomCapacityDialog.close();
        el.form.requestSubmit();
      });
    }

    async function load() {
      try {
        const response = await server('getInitialData');
        if (!response || !response.ok) throw new Error(response && response.message || '初始化失敗');
        state.config = response;
        document.getElementById('eventTitle').textContent = response.event.title;
        document.getElementById('eventDate').textContent = response.event.date;
        response.rules.routes.forEach(route => {
          const option = new Option(route.name, route.id);
          option.dataset.baseName = route.name;
          el.routeId.add(option);
        });
        addMember(true);
        renderAll();
      } catch (error) {
        showError(error.message);
      }
    }

    function handleChange(event) {
      if (!state.config) return;
      const insuranceCard = event.target.closest('.insurance-member');
      if (insuranceCard) {
        captureInsuranceCard(insuranceCard);
        updateInsuranceCardVisibility(insuranceCard);
        renderQuote();
        return;
      }
      const card = event.target.closest('.member-card');
      if (event.target === el.routeId || event.target.name === 'transportMode' || event.target.name === 'travelMode') {
        el.routeOptions.innerHTML = '';
      }
      if (event.target.name === 'registrationType') updateRegistrationType();
      if (event.target === el.meetingOnly) updateMeetingOnly();
      if (event.target === el.accommodation) updateAccommodation();
      if (card && event.target.dataset.field === 'church') updateAreaFields(card, true);
      if (card && event.target.dataset.field === 'careArea') updateDistricts(card, true);
      if (card && event.target.dataset.field === 'identityCategory') updateAgeFields(card);
      if (card && event.target.dataset.field === 'name') scheduleEarlyBirdCheck();
      renderAll();
    }

    function handleMemberClick(event) {
      const remove = event.target.closest('.remove-member');
      if (!remove) return;
      const card = remove.closest('.member-card');
      if (card.dataset.primary === 'true') return;
      delete state.insuranceByMember[card.dataset.memberId];
      card.remove();
      renumber();
      scheduleEarlyBirdCheck();
      renderAll();
    }

    function scheduleEarlyBirdCheck() {
      clearTimeout(state.earlyBirdTimer);
      state.earlyBirdRequestId += 1;
      const requestId = state.earlyBirdRequestId;
      const cards = [...el.participants.querySelectorAll('.adult-card')];
      const names = cards.map(card => value(card, 'name'));
      cards.forEach((card, index) => {
        if (!names[index]) renderEarlyBirdStatus(card, 'NONE');
      });
      if (!names.some(Boolean)) return;
      state.earlyBirdTimer = setTimeout(async () => {
        try {
          const response = await server('checkEarlyBirdNames', names);
          if (requestId !== state.earlyBirdRequestId || !response || !response.ok) return;
          const currentCards = [...el.participants.querySelectorAll('.adult-card')];
          currentCards.forEach((card, index) => {
            if (value(card, 'name') !== names[index]) return;
            const result = response.results && response.results[index];
            renderEarlyBirdStatus(card, result && result.status || 'NONE');
          });
        } catch (_) {
          // 早鳥提示為輔助資訊，連線失敗時不阻擋報名。
        }
      }, 450);
    }

    function renderEarlyBirdStatus(card, status) {
      const badge = card.querySelector('[data-early-bird-status]');
      badge.classList.remove('early-bird-status--paid', 'early-bird-status--unpaid');
      if (status === 'PAID') {
        badge.textContent = '您有報名早鳥方案，完成報名後請和青職組聯絡。';
        badge.classList.add('early-bird-status--paid');
        badge.hidden = false;
        return;
      }
      if (status === 'UNPAID') {
        badge.textContent = '您的早鳥方案資格，因報名時未繳費已被取消。';
        badge.classList.add('early-bird-status--unpaid');
        badge.hidden = false;
        return;
      }
      badge.textContent = '';
      badge.hidden = true;
    }

    function registrationType() {
      return el.form.querySelector('[name="registrationType"]:checked').value;
    }

    function updateRegistrationType() {
      if (registrationType() === 'PERSONAL') {
        [...el.participants.querySelectorAll('.member-card:not([data-primary="true"])')].forEach(card => card.remove());
      }
      renumber();
      scheduleEarlyBirdCheck();
    }

    function addMember(isPrimary) {
      if (!state.config) return;
      state.memberCounter += 1;
      const fragment = el.memberTemplate.content.cloneNode(true);
      const card = fragment.querySelector('.adult-card');
      card.dataset.memberId = 'M' + state.memberCounter;
      card.dataset.primary = String(isPrimary);
      state.insuranceByMember[card.dataset.memberId] = emptyInsuranceData();
      const church = card.querySelector('[data-field="church"]');
      church.innerHTML = '<option value="">請選擇</option>' +
        state.config.areas.map(area => `<option value="${escapeHtml(area.name)}">${escapeHtml(area.name)}</option>`).join('');
      const identities = state.config.rules.identities.slice();
      if (!isPrimary) identities.push({ value: 'CHILD', label: '兒童' });
      card.querySelector('[data-field="identityCategory"]').innerHTML = '<option value="">請選擇</option>' +
        identities.map(item => `<option value="${item.value}">${escapeHtml(item.label)}</option>`).join('');
      if (isPrimary) {
        card.querySelector('.remove-member').hidden = true;
        card.querySelector('.member-title').textContent = '主報名者';
      }
      el.participants.appendChild(fragment);
      updateAreaFields(card, false);
      updateAgeFields(card);
      renumber();
      if (!isPrimary) renderAll();
    }

    function renumber() {
      const type = registrationType();
      [...el.participants.querySelectorAll('.adult-card')].forEach((card, index) => {
        const primary = card.dataset.primary === 'true';
        card.querySelector('.member-title').textContent = primary ? '主報名者' :
          (type === 'FAMILY' ? `家人${index}` : `同行者${index}`);
        updateAgeFields(card);
      });
      el.addMember.hidden = type === 'PERSONAL';
      el.addMember.textContent = type === 'FAMILY' ? '＋ 新增家人' : '＋ 新增同行者';
    }

    function updateAreaFields(card, clear) {
      const church = card.querySelector('[data-field="church"]').value;
      const careField = card.querySelector('[data-field="careArea"]');
      const districtField = card.querySelector('[data-field="district"]');
      const show = church === '高雄' && !isChildCard(card);
      card.querySelectorAll('.kaohsiung-only').forEach(field => field.hidden = !show);
      careField.required = show;
      districtField.required = show;
      if (!show) {
        careField.value = '';
        districtField.value = '';
        return;
      }
      const area = state.config.areas.find(item => item.name === '高雄');
      const previous = clear ? '' : careField.value;
      careField.innerHTML = '<option value="">請選擇</option>' +
        (area.careAreaOrder || Object.keys(area.careAreas))
          .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      careField.value = previous;
      updateDistricts(card, clear);
    }

    function updateDistricts(card, clear) {
      const careArea = card.querySelector('[data-field="careArea"]').value;
      const district = card.querySelector('[data-field="district"]');
      const area = state.config.areas.find(item => item.name === '高雄');
      const previous = clear ? '' : district.value;
      const options = area && area.careAreas[careArea] || [];
      district.innerHTML = '<option value="">請選擇</option>' +
        options.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      district.value = previous;
    }

    function isChildCard(card) {
      return card.querySelector('[data-field="identityCategory"]').value === 'CHILD';
    }

    function updateAgeFields(card) {
      const child = isChildCard(card);
      const childAgeField = card.querySelector('.child-age-field');
      childAgeField.hidden = !child;
      childAgeField.querySelector('select').required = child;
      if (!child) childAgeField.querySelector('select').value = '';
      card.querySelectorAll('.adult-only').forEach(field => field.hidden = child);
      card.querySelectorAll('.adult-only input, .adult-only select').forEach(input => {
        input.required = !child && input.dataset.optional !== 'true';
        if (child) input.value = '';
      });
      updateAreaFields(card, false);
    }

    function meetingOnly() {
      return el.meetingOnly.checked;
    }

    function updateMeetingOnly() {
      const only = meetingOnly();
      el.accommodationSection.hidden = only;
      el.accommodation.disabled = only;
      el.accommodation.required = !only;
      el.roomType.disabled = only;
      el.transportCard.classList.toggle('survey-card-hidden', only);
      el.travelCard.classList.toggle('survey-card-hidden', only);
      el.transportCard.querySelectorAll('input').forEach(input => {
        input.disabled = only;
        input.required = !only;
        if (only) input.checked = false;
      });
      el.travelCard.querySelectorAll('input, select').forEach(input => {
        input.disabled = only;
        input.required = false;
      });
      if (only) {
        el.form.querySelector('[name="travelMode"][value="NONE"]').checked = true;
        el.routeId.value = '';
      }
      updateAccommodation();
    }

    function updateAccommodation() {
      const hotel = !meetingOnly() && el.accommodation.value === 'HOWARD';
      el.roomField.hidden = !hotel;
      el.roomType.required = hotel;
      el.roomType.disabled = meetingOnly();
      if (hotel && registrationType() === 'PERSONAL' && !el.roomType.value) el.roomType.value = 'QUAD';
      if (!hotel) el.roomType.value = '';
      el.hotelInfo.hidden = !hotel;
      updatePersonalRoomWarning();
    }

    function updatePersonalRoomWarning() {
      const roomLabels = { SIX: '六人房', TRIPLE: '三人房', DOUBLE: '二人房' };
      const roomLabel = roomLabels[el.roomType.value];
      const show = !meetingOnly() && registrationType() === 'PERSONAL' &&
        el.accommodation.value === 'HOWARD' && Boolean(roomLabel);
      el.personalRoomWarning.hidden = !show;
      el.personalRoomConfirm.required = show;
      if (show) {
        el.personalRoomWarningText.textContent =
          `您選擇的是${roomLabel}，同住者將由青職組安排。若無合適配對者，屆時需加收空床費。`;
      } else {
        el.personalRoomWarningText.textContent = '';
        el.personalRoomConfirm.checked = false;
      }
    }

    function emptyInsuranceData() {
      return {
        travelInsurance: 'NO', insuredBirthRoc: '', insuredNationalId: '',
        guardianName: '', guardianBirthRoc: '', guardianNationalId: ''
      };
    }

    function captureInsuranceSurvey() {
      [...el.insuranceParticipants.querySelectorAll('.insurance-member')].forEach(captureInsuranceCard);
    }

    function captureInsuranceCard(card) {
      const memberId = card.dataset.memberId;
      const data = Object.assign(emptyInsuranceData(), state.insuranceByMember[memberId] || {});
      card.querySelectorAll('[data-insurance-field]').forEach(input => {
        data[input.dataset.insuranceField] = input.value.trim();
      });
      state.insuranceByMember[memberId] = data;
    }

    function updateInsuranceCardVisibility(card) {
      const select = card.querySelector('[data-insurance-field="travelInsurance"]');
      const insured = select && select.value === 'YES';
      const child = card.dataset.child === 'true';
      const details = card.querySelector('[data-insurance-details]');
      if (details) details.hidden = !insured;
      const guardian = card.querySelector('[data-guardian-fields]');
      if (guardian) guardian.hidden = !(insured && child);
      ['insuredBirthRoc', 'insuredNationalId'].forEach(field => {
        const input = card.querySelector(`[data-insurance-field="${field}"]`);
        if (input) input.required = insured;
      });
      ['guardianName', 'guardianBirthRoc', 'guardianNationalId'].forEach(field => {
        const input = card.querySelector(`[data-insurance-field="${field}"]`);
        if (input) input.required = insured && child;
      });
    }

    function insuranceMode() {
      if (meetingOnly()) return 'NONE';
      const transport = transportMode();
      const routeId = el.routeId.value;
      if (['MOTORCYCLE', 'BICYCLE', 'COACH'].includes(transport)) return 'REQUIRED';
      if (transport === 'CARPOOL' && ['R03', 'R08'].includes(routeId)) return 'OPTIONAL';
      return 'NONE';
    }

    function renderInsuranceSurvey() {
      captureInsuranceSurvey();
      const mode = insuranceMode();
      const eligible = mode !== 'NONE';
      const required = mode === 'REQUIRED';
      el.insuranceSurvey.hidden = !eligible;
      if (!eligible) {
        [...el.participants.querySelectorAll('.adult-card')].forEach(card => {
          state.insuranceByMember[card.dataset.memberId] = emptyInsuranceData();
        });
        el.insuranceParticipants.innerHTML = '';
        return;
      }
      el.insuranceTitle.textContent = required ? '旅遊平安保險（必須加保）' : '旅遊平安保險';
      el.insuranceDescription.textContent = required
        ? '本路線及交通方式全員必須加保，每位加保費用 50 元。'
        : '自行開車者可由每位成員分開決定是否加保，每位加保費用 50 元。';
      const cards = [...el.participants.querySelectorAll('.adult-card')];
      el.insuranceParticipants.innerHTML = cards.map((card, index) => {
        const memberId = card.dataset.memberId;
        const data = Object.assign(emptyInsuranceData(), state.insuranceByMember[memberId] || {});
        if (required) data.travelInsurance = 'YES';
        state.insuranceByMember[memberId] = data;
        const child = isChildCard(card);
        const insured = data.travelInsurance === 'YES';
        const role = card.dataset.primary === 'true' ? '主報名者' :
          (registrationType() === 'FAMILY' ? `家人${index}` : `同行者${index}`);
        const memberName = value(card, 'name') || '姓名尚未填寫';
        const guardianFields = child ? `<div class="guardian-fields form-grid" data-guardian-fields ${insured ? '' : 'hidden'}>
          <label class="field"><span>監護人姓名</span><input data-insurance-field="guardianName" maxlength="40" value="${escapeHtml(data.guardianName)}" ${insured ? 'required' : ''}></label>
          <label class="field"><span>監護人出生年月日（民國年）</span><input data-insurance-field="guardianBirthRoc" inputmode="numeric" maxlength="10" pattern="[0-9]{1,3}[/-][0-9]{1,2}[/-][0-9]{1,2}" placeholder="例：60/01/02" value="${escapeHtml(data.guardianBirthRoc)}" ${insured ? 'required' : ''}></label>
          <label class="field"><span>監護人身分證字號</span><input data-insurance-field="guardianNationalId" maxlength="10" pattern="[A-Za-z][12][0-9]{8}" autocapitalize="characters" placeholder="例：A123456789" value="${escapeHtml(data.guardianNationalId)}" ${insured ? 'required' : ''}></label>
        </div>` : '';
        return `<article class="insurance-member" data-member-id="${memberId}" data-child="${child}">
          <h4>${escapeHtml(role)}｜${escapeHtml(memberName)} <small class="insurance-name-note">※ 姓名需與身分證相同</small></h4>
          <label class="field"><span>${required ? '加保狀態' : '是否加保旅遊平安險'}</span><select data-insurance-field="travelInsurance" ${required ? 'disabled aria-disabled="true"' : ''}>
            ${required ? '<option value="YES" selected>必須加保（加收50元）</option>' :
              `<option value="NO" ${insured ? '' : 'selected'}>否</option><option value="YES" ${insured ? 'selected' : ''}>是（加收50元）</option>`}
          </select></label>
          <div class="insurance-details form-grid" data-insurance-details ${insured ? '' : 'hidden'}>
            <label class="field"><span>被保險人出生年月日（民國年）</span><input data-insurance-field="insuredBirthRoc" inputmode="numeric" maxlength="10" pattern="[0-9]{1,3}[/-][0-9]{1,2}[/-][0-9]{1,2}" placeholder="例：85/01/02" value="${escapeHtml(data.insuredBirthRoc)}" ${insured ? 'required' : ''}></label>
            <label class="field"><span>被保險人身分證字號</span><input data-insurance-field="insuredNationalId" maxlength="10" pattern="[A-Za-z][12][0-9]{8}" autocapitalize="characters" placeholder="例：A123456789" value="${escapeHtml(data.insuredNationalId)}" ${insured ? 'required' : ''}></label>
            ${guardianFields}
          </div>
        </article>`;
      }).join('');
    }

    function renderAll() {
      if (!state.config) return;
      updateMeetingOnly();
      enforceTravelMode();
      renderRoute();
      renderInsuranceSurvey();
      renderQuote();
    }

    function travelMode() {
      if (meetingOnly()) return 'NONE';
      return el.form.querySelector('[name="travelMode"]:checked').value;
    }

    function transportMode() {
      if (meetingOnly()) return '';
      const selected = el.form.querySelector('[name="transportMode"]:checked');
      return selected ? selected.value : '';
    }

    function enforceTravelMode() {
      if (meetingOnly()) return;
      const transport = transportMode();
      const mustTravel = ['MOTORCYCLE', 'BICYCLE', 'COACH'].includes(transport);
      const selfPayForbidden = ['MOTORCYCLE', 'BICYCLE', 'COACH'].includes(transport);
      const noneInput = el.form.querySelector('[name="travelMode"][value="NONE"]');
      const standardInput = el.form.querySelector('[name="travelMode"][value="STANDARD"]');
      const selfPayInput = el.form.querySelector('[name="travelMode"][value="SELF_PAY"]');
      noneInput.disabled = mustTravel;
      selfPayInput.disabled = selfPayForbidden;
      noneInput.closest('.choice').classList.toggle('choice--disabled', mustTravel);
      selfPayInput.closest('.choice').classList.toggle('choice--disabled', selfPayForbidden);
      if ((mustTravel && noneInput.checked) || (selfPayForbidden && selfPayInput.checked)) {
        standardInput.checked = true;
      }
    }

    function routeAllowed(routeId, mode, transport) {
      const transportRule = state.config.rules.transportModes.find(item => item.value === transport);
      if (!transportRule || !transportRule.routes.includes(routeId)) return false;
      if (mode === 'SELF_PAY' && transport === 'COACH') return false;
      return !(mode === 'SELF_PAY' && ['R01', 'R02'].includes(routeId));
    }

    function renderRoute() {
      const mode = travelMode();
      const selfPay = mode === 'SELF_PAY';
      const transport = transportMode();
      [...el.routeId.options].forEach(option => {
        if (!option.value) return;
        const allowed = routeAllowed(option.value, mode, transport);
        option.disabled = !allowed;
        option.textContent = option.dataset.baseName +
          (allowed ? '' : '（您無法選擇此路線）');
        option.classList.toggle('route-unavailable', !allowed);
      });
      if (el.routeId.value && !routeAllowed(el.routeId.value, mode, transport)) el.routeId.value = '';
      el.routeSection.hidden = mode === 'NONE';
      el.routeId.required = mode !== 'NONE';
      if (mode === 'NONE') {
        el.routeId.value = '';
        el.routeInfo.hidden = true;
        el.routeDetailTable.innerHTML = '';
        el.routeOptions.innerHTML = '';
        el.route7Count.hidden = true;
        el.onsiteTable.innerHTML = '';
        el.pendingTable.innerHTML = '';
        return;
      }
      const route = currentRoute();
      if (!route) {
        el.routeInfo.hidden = true;
        el.routeDetailTable.innerHTML = '';
        el.routeOptions.innerHTML = '';
        el.route7Count.hidden = true;
        return;
      }
      el.routeInfo.hidden = false;
      const options = collectRouteOptions();
      const itinerary = itineraryTable((route.itinerary || []).filter(item =>
        includeRouteItem(item, transport, options)));
      const routeNotes = route.notes && route.notes.length
        ? `<div class="route-notes"><strong>${escapeHtml(route.notesTitle || '行程備註')}</strong><ul>` +
          route.notes.map(note => `<li>${escapeHtml(note)}</li>`).join('') + '</ul></div>'
        : '';
      el.routeInfo.innerHTML = `<strong>${escapeHtml(route.name)}</strong><br>${escapeHtml(route.description)}` +
        (selfPay ? '<br><b>自行購票及用餐：旅遊費不納入報名總額。</b>' : '') + itinerary + routeNotes;
      el.routeDetailTable.innerHTML = detailTable((route.details || []).filter(item =>
        includeRouteItem(item, transport, options)));
      renderRouteOptions(route);
      renderFareNotice(route);
      el.onsiteTable.innerHTML = mode === 'STANDARD' ? priceTable('當場繳交價目表', onsiteRows(route, collectRouteOptions())) : '';
      el.pendingTable.innerHTML = mode === 'STANDARD' ? priceTable('待確認項目', pendingRows(route), true) : '';
    }

    function itineraryTable(rows) {
      if (!rows.length) return '';
      let previousDate = '';
      return `<div class="route-itinerary"><strong>詳細行程</strong><div class="route-itinerary-scroll">` +
        `<table aria-label="詳細行程"><thead><tr><th>日期</th><th>時間</th><th>行程</th></tr></thead><tbody>` +
        rows.map(row => {
          const rawTime = String(row.time || '');
          const matched = rawTime.match(/^(\d{1,2}\/\d{1,2})\s*(.*)$/);
          const date = matched ? matched[1] : '';
          const time = matched ? matched[2] : rawTime;
          const displayedDate = date && date !== previousDate ? date : '';
          if (date) previousDate = date;
          return `<tr><td>${escapeHtml(displayedDate)}</td><td>${escapeHtml(time)}</td>` +
            `<td>${escapeHtml(row.activity || '')}</td></tr>`;
        }).join('') +
        `</tbody></table></div></div>`;
    }

    function renderFareNotice(route) {
      if (travelMode() === 'SELF_PAY') {
        el.route7Count.hidden = false;
        el.route7Count.innerHTML = '<strong>以上皆為建議行程，請自行安排並和店家聯絡。</strong>';
        return;
      }
      if (route.id === 'R04') {
        el.route7Count.hidden = false;
        el.route7Count.innerHTML = '<strong>鹿境門票請自行處理</strong>';
        return;
      }
      const members = participantPayload();
      if (!['R06', 'R07', 'R08'].includes(route.id)) {
        el.route7Count.hidden = true;
        el.route7Count.innerHTML = '';
        return;
      }
      el.route7Count.hidden = false;
      if (route.id === 'R06') {
        const existing = Number(state.config.route6ExistingSubmarineAdultCount || 0);
        const current = Number(collectRouteOptions().r6SubmarineCount || 0);
        const projected = existing + current;
        const status = projected >= 20
          ? '成人已達20位以上，承辦單位需要提前準備一份保險名單。'
          : `成人未達20位；若再有 ${20 - projected} 人報名，即需提前準備保險名單。`;
        el.route7Count.innerHTML = `<strong>半潛艇成人報名人數：</strong>` +
          `目前已有 ${existing} 人，本次 ${current} 人，合計 ${projected} 人。${escapeHtml(status)}`;
        return;
      }
      let heading = '';
      let footnote = '';
      let ticketForMember;
      if (route.id === 'R07') {
        const projected = state.config.route7ExistingCount + members.length;
        const group = projected >= 20;
        heading = `海生館票價判定：目前已選路線7共 ${state.config.route7ExistingCount} 人，含本次共 ${projected} 人；` +
          (group ? '已達20人，適用者採團體票。' : '未達20人，採個人票價。');
        ticketForMember = member => seaTicketInfo(member, group);
      } else {
        heading = '森林遊樂區票價判定（活動日為假日）：';
        footnote = '兒童資料目前採年齡區間：幼兒0～5歲以10元估算，若實際為0～2歲則免票；兒童6～11歲以75元估算，若實際為6歲則為10元。';
        ticketForMember = forestTicketInfo;
      }
      const rows = members.map((member, index) => {
        const ticket = ticketForMember(member);
        return `<li><strong>${escapeHtml(member.name || `成員${index + 1}`)}</strong>｜` +
          `${escapeHtml(ageLabelForMember(member))}：${escapeHtml(ticket.label)}` +
          (ticket.amount == null ? '' : ` ${money(ticket.amount)}`) + '</li>';
      }).join('');
      el.route7Count.innerHTML = `<strong>${escapeHtml(heading)}</strong><ul>${rows}</ul>` +
        (footnote ? `<small>${escapeHtml(footnote)}</small>` : '');
    }

    function renderRouteOptions(route) {
      if (travelMode() === 'SELF_PAY') {
        el.routeOptions.innerHTML = '';
        return;
      }
      const existing = collectRouteOptions();
      const count = participantPayload().length;
      let html = '';
      if (['R03', 'R08'].includes(route.id) && transportMode() === 'CARPOOL') {
        const restaurant = route.id === 'R03' ? '珍饌庭園餐廳（每人300元，0～5歲幼兒免費）' :
          '莊記甕窯雞（每人350元）';
        html = `<fieldset class="field-group optional-lunch"><legend>是否參加10/4午餐（整組統一）</legend>` +
          `<p>本組所有成員須選擇相同安排；參加地點：${escapeHtml(restaurant)}。</p>` +
          `<div class="choice-grid choice-grid--two">` +
          `<label class="choice compact"><input type="radio" name="r10_4Lunch" value="YES" ${existing.r10_4Lunch === 'YES' ? 'checked' : ''} required><span><strong>參加</strong><small>全組餐費納入報名總額</small></span></label>` +
          `<label class="choice compact"><input type="radio" name="r10_4Lunch" value="NO" ${existing.r10_4Lunch === 'NO' ? 'checked' : ''} required><span><strong>不參加</strong><small>10/4午餐自行安排</small></span></label>` +
          `</div></fieldset>`;
      }
      if (route.id === 'R04') {
        html = countField('水上活動參加人數（其餘人員可在沙灘休息）',
          'r4WaterCount', count, existing.r4WaterCount);
      }
      if (route.id === 'R05') {
        const paintballEligible = participantPayload().filter(member => ageForMember(member) >= 12).length;
        const waterballEligible = participantPayload().filter(member => ageForMember(member) >= 7).length;
        const capacities = state.config.activityCapacities || {};
        const paintballRemaining = Math.max(0, Number(capacities.r5Paintball || 40) - Number(state.config.route5ExistingPaintballCount || 0));
        const waterballRemaining = Math.max(0, Number(capacities.r5Waterball || 50) - Number(state.config.route5ExistingWaterballCount || 0));
        html = countField('漆彈參加人數（須滿12歲，每人570元）',
          'r5PaintballCount', Math.min(paintballEligible, paintballRemaining), existing.r5PaintballCount, paintballRemaining) +
          countField('水彈參加人數（須滿7歲，每人570元）',
            'r5WaterballCount', Math.min(waterballEligible, waterballRemaining), existing.r5WaterballCount, waterballRemaining);
      }
      if (route.id === 'R06') {
        const members = participantPayload();
        const adultCount = members.filter(member => member.identityCategory !== 'CHILD').length;
        const childCount = members.filter(member => member.identityCategory === 'CHILD').length;
        const capacities = state.config.activityCapacities || {};
        const snorkelRemaining = Math.max(0, Number(capacities.r6Snorkel || 70) - Number(state.config.route6ExistingSnorkelCount || 0));
        const selectedChildCount = Math.min(childCount, Number(existing.r6SubmarineChildCount || 0));
        html = countField('浮潛參加人數（每人350元，報名時繳交）',
          'r6SnorkelCount', Math.min(count, snorkelRemaining), existing.r6SnorkelCount, snorkelRemaining) +
          countField('半潛艇成人參加人數（每人300元，報名時繳交）',
            'r6SubmarineCount', adultCount, existing.r6SubmarineCount) +
          countField('半潛艇12歲以下參加人數（每人280元，報名時繳交）',
            'r6SubmarineChildCount', childCount, existing.r6SubmarineChildCount) +
          countField('其中未滿3歲人數（現場購買100元保險票，不納入報名總額）',
            'r6SubmarineInfantCount', selectedChildCount, existing.r6SubmarineInfantCount);
      }
      el.routeOptions.innerHTML = html ? `<div class="route-options">${html}</div>` : '';
    }

    function optionGroup(title, name, options, selected) {
      return `<fieldset class="field-group"><legend>${escapeHtml(title)}</legend><div class="choice-grid choice-grid--three">` +
        options.map(option => `<label class="choice compact"><input type="radio" name="${name}" value="${option[0]}" ${selected === option[0] ? 'checked' : ''} required><span><strong>${escapeHtml(option[1])}</strong></span></label>`).join('') +
        '</div></fieldset>';
    }

    function countField(title, name, maximum, selected, capacityRemaining) {
      const requested = selected === '' || selected == null ? 0 : Number(selected);
      const value = Math.min(Math.max(0, requested), maximum);
      const capacityText = capacityRemaining == null ? '' :
        `<small class="capacity-note">目前尚有 ${capacityRemaining} 個名額；本次選擇後剩 ${Math.max(0, capacityRemaining - value)} 個。</small>`;
      return `<label class="field activity-count"><span>${escapeHtml(title)}</span><select name="${name}" required>` +
        Array.from({ length: maximum + 1 }, (_, index) =>
          `<option value="${index}" ${index === value ? 'selected' : ''}>${index} 人</option>`).join('') +
        `</select>${capacityText}</label>`;
    }

    function detailTable(rows) {
      if (!rows.length) return '';
      return `<table class="mini-table route-detail-table"><caption>本路線費用細目</caption><thead><tr><th>項目</th><th>金額</th><th>繳交方式</th></tr></thead><tbody>` +
        rows.map(row => `<tr><td>${escapeHtml(row.item)}</td><td>${row.amount == null ? escapeHtml(row.unit || '依條件') : `${money(row.amount)}／${escapeHtml(row.unit || '項')}`}</td><td>${escapeHtml(row.payment)}</td></tr>`).join('') +
        '</tbody></table>';
    }

    function onsiteRows(route, options) {
      if (route.id === 'R04') return [];
      const rows = (route.onsite || []).slice();
      if (route.id === 'R06') {
        const count = Number(options && options.r6SubmarineInfantCount || 0);
        if (count) rows.push({ item: `半潛艇未滿3歲保險票（${count}人）`, amount: count * 100 });
      }
      return rows;
    }

    function pendingRows(route) {
      return route.pending || [];
    }

    function priceTable(title, rows, pending) {
      if (!rows || !rows.length) return '';
      return `<table class="mini-table"><caption>${escapeHtml(title)}</caption><tbody>` +
        rows.map(row => `<tr><td>${escapeHtml(row.item)}</td><td>${row.amount == null ? '收費方式待確認' : money(row.amount)}${pending ? '（待確認）' : ''}</td></tr>`).join('') +
        '</tbody></table>';
    }

    function currentRoute() {
      return state.config.rules.routes.find(route => route.id === el.routeId.value) || null;
    }

    function collectRouteOptions() {
      const result = {};
      ['r4WaterCount', 'r5PaintballCount', 'r5WaterballCount',
        'r6SnorkelCount', 'r6SubmarineCount', 'r6SubmarineChildCount',
        'r6SubmarineInfantCount'].forEach(name => {
        const input = el.form.querySelector(`[name="${name}"]`);
        if (input) result[name] = input.value;
      });
      const october4Lunch = el.form.querySelector('[name="r10_4Lunch"]:checked');
      if (october4Lunch) result.r10_4Lunch = october4Lunch.value;
      return result;
    }

    function includeRouteItem(item, transport, options) {
      if (!item.coachOnly) return true;
      if (transport === 'COACH') return true;
      return Boolean(item.optionalCarpoolLunch && transport === 'CARPOOL' &&
        options.r10_4Lunch === 'YES');
    }

    function participantPayload() {
      captureInsuranceSurvey();
      const sharedAccommodation = meetingOnly() ? 'SELF' : el.accommodation.value;
      const sharedRoomType = meetingOnly() ? '' : el.roomType.value;
      return [...el.participants.querySelectorAll('.adult-card')].map(card => {
        const insurance = Object.assign(emptyInsuranceData(), state.insuranceByMember[card.dataset.memberId] || {});
        return {
          role: card.dataset.primary === 'true' ? 'PRIMARY' : (registrationType() === 'FAMILY' ? 'FAMILY' : 'COMPANION'),
          name: value(card, 'name'),
          phone: value(card, 'phone'),
          relationship: value(card, 'relationship'),
          church: value(card, 'church'),
          careArea: value(card, 'careArea'),
          district: value(card, 'district'),
          identityCategory: value(card, 'identityCategory'),
          childAgeBand: value(card, 'childAgeBand'),
          accommodation: sharedAccommodation,
          roomType: sharedRoomType,
          travelInsurance: insurance.travelInsurance,
          insuredBirthRoc: insurance.insuredBirthRoc,
          insuredNationalId: insurance.insuredNationalId,
          guardianName: insurance.guardianName,
          guardianBirthRoc: insurance.guardianBirthRoc,
          guardianNationalId: insurance.guardianNationalId
        };
      });
    }

    function value(card, field) {
      const input = card.querySelector(`[data-field="${field}"]`);
      return input ? input.value.trim() : '';
    }

    function calculateQuote() {
      const members = participantPayload();
      const route = currentRoute();
      const mode = travelMode();
      const transport = transportMode();
      const options = collectRouteOptions();
      const group = route && route.id === 'R07' && state.config.route7ExistingCount + members.length >= 20;
      const activityIndices = selectedActivityIndices(members, route, options);
      let accommodation = 0, surcharge = 0, travel = 0, meeting = 0, insurance = 0;
      const memberBreakdown = [];
      const groupFees = [];
      members.forEach((member, index) => {
        const adult = member.identityCategory !== 'CHILD';
        const staying = member.accommodation === 'HOWARD';
        const room = state.config.rules.roomTypes.find(item => item.value === member.roomType) || { surcharge: 0 };
        let base = 0;
        if (staying) {
          if (!adult) base = member.childAgeBand === 'INFANT' ? 300 : 1000;
          else base = ['MIDDLE', 'ELDER'].includes(member.identityCategory) ? 3490 : 2500;
        } else if (!meetingOnly()) {
          base = 300;
        }
        const roomFee = adult && staying ? room.surcharge : 0;
        const routeFee = mode === 'STANDARD' && route
          ? memberTravelFee(member, index, route.id, options, transport, group, activityIndices) : 0;
        const meetingFee = meetingOnly() ? 300 : 0;
        const insuranceFee = insuranceMode() !== 'NONE' && member.travelInsurance === 'YES' ? 50 : 0;
        accommodation += base;
        surcharge += roomFee;
        travel += routeFee;
        meeting += meetingFee;
        insurance += insuranceFee;
        memberBreakdown.push({
          name: member.name || `成員${index + 1}`,
          role: member.role,
          accommodation: base,
          accommodationLabel: staying ? '住宿費' : '基本費用（住宿自理）',
          room: roomFee,
          travel: routeFee,
          meeting: meetingFee,
          insurance: insuranceFee,
          total: base + roomFee + routeFee + meetingFee + insuranceFee
        });
      });
      if (mode === 'STANDARD' && route && route.id === 'R05') {
        const paintballCount = Number(options.r5PaintballCount || 0);
        const waterballCount = Number(options.r5WaterballCount || 0);
        if (paintballCount) {
          const amount = paintballCount * 570;
          groupFees.push({ item: `漆彈活動費（${paintballCount}人）`, amount });
          travel += amount;
        }
        if (waterballCount) {
          const amount = waterballCount * 570;
          groupFees.push({ item: `水彈活動費（${waterballCount}人）`, amount });
          travel += amount;
        }
      }
      if (mode === 'STANDARD' && route && route.id === 'R06') {
        const snorkelCount = Number(options.r6SnorkelCount || 0);
        const submarineAdultCount = Number(options.r6SubmarineCount || 0);
        const submarineChildCount = Number(options.r6SubmarineChildCount || 0);
        const submarineInfantCount = Number(options.r6SubmarineInfantCount || 0);
        if (snorkelCount) {
          const amount = snorkelCount * 350;
          groupFees.push({ item: `浮潛活動費（${snorkelCount}人）`, amount });
          travel += amount;
        }
        if (submarineAdultCount) {
          const amount = submarineAdultCount * 300;
          groupFees.push({ item: `半潛艇成人票（${submarineAdultCount}人，300元／人）`, amount });
          travel += amount;
        }
        const childPaidCount = Math.max(0, submarineChildCount - submarineInfantCount);
        if (childPaidCount) {
          const amount = childPaidCount * 280;
          groupFees.push({ item: `半潛艇12歲以下票（${childPaidCount}人，280元／人）`, amount });
          travel += amount;
        }
      }
      return {
        accommodation, surcharge, travel, meeting, insurance,
        total: accommodation + surcharge + travel + meeting + insurance, memberBreakdown,
        groupFees,
        onsite: mode === 'STANDARD' && route ? onsiteRows(route, options) : [],
        pending: mode === 'STANDARD' && route ? pendingRows(route) : []
      };
    }

    function selectedActivityIndices(members, route, options) {
      if (!route) return [];
      if (route.id === 'R04') {
        return members.map((_, index) => index).slice(0, Number(options.r4WaterCount || 0));
      }
      return [];
    }

    function memberTravelFee(member, index, routeId, options, transport, group, activityIndices) {
      const october4Lunch = ['R03', 'R08'].includes(routeId) &&
        (transport === 'COACH' || (transport === 'CARPOOL' && options.r10_4Lunch === 'YES'));
      const infant = member.identityCategory === 'CHILD' && member.childAgeBand === 'INFANT';
      if (routeId === 'R01') return 400;
      if (routeId === 'R02') return 203 + 361;
      if (routeId === 'R03') return 350 + (october4Lunch && !infant ? 300 : 0) + (transport === 'COACH' ? 600 : 0);
      if (routeId === 'R04') return (activityIndices.includes(index) ? 500 : 0) + 500;
      if (routeId === 'R05') return 450;
      if (routeId === 'R06') return 300;
      if (routeId === 'R07') return seaTicket(member, group) + 95;
      if (routeId === 'R08') return forestTicket(member) + 300 + (october4Lunch ? 350 : 0) + (transport === 'COACH' ? 600 : 0);
      return 0;
    }

    function ageForMember(member) {
      if (member.identityCategory === 'CHILD') return member.childAgeBand === 'INFANT' ? 5 : 8;
      if (member.identityCategory === 'YOUNG_35') return 30;
      if (member.identityCategory === 'YOUNG_ADULT') return 40;
      if (member.identityCategory === 'MIDDLE') return 55;
      return 65;
    }

    function seaTicket(member, group) {
      return seaTicketInfo(member, group).amount || 0;
    }

    function seaTicketInfo(member, group) {
      if (!member.identityCategory) return { label: '請先選擇年齡', amount: null };
      if (member.identityCategory === 'CHILD' && member.childAgeBand === 'INFANT') {
        return { label: '免費票', amount: 0 };
      }
      if (member.identityCategory === 'CHILD') return { label: '優待票', amount: 250 };
      if (member.identityCategory === 'ELDER') return { label: '博愛票', amount: 225 };
      if (group) return { label: '20人以上團體票', amount: 350 };
      return { label: '全票', amount: 450 };
    }

    function forestTicket(member) {
      return forestTicketInfo(member).amount || 0;
    }

    function forestTicketInfo(member) {
      if (!member.identityCategory) return { label: '請先選擇年齡', amount: null };
      if (member.identityCategory === 'CHILD' && member.childAgeBand === 'INFANT') {
        return { label: '幼兒優待票（0～2歲可免票）', amount: 10 };
      }
      if (member.identityCategory === 'CHILD') {
        return { label: '兒童半票（6歲適用10元優待票）', amount: 75 };
      }
      if (member.identityCategory === 'ELDER') return { label: '65歲以上優待票', amount: 10 };
      return { label: '全票（假日）', amount: 150 };
    }

    function ageLabelForMember(member) {
      if (!member.identityCategory) return '年齡尚未選擇';
      if (member.identityCategory === 'CHILD') {
        if (member.childAgeBand === 'INFANT') return '幼兒（0～5歲）';
        if (member.childAgeBand === 'CHILD_6_11') return '兒童（6～11歲）';
        return '兒童年齡尚未選擇';
      }
      const item = state.config.rules.identities.find(identity => identity.value === member.identityCategory);
      return item ? item.label : '年齡尚未選擇';
    }

    function renderQuote() {
      const quote = calculateQuote();
      el.grandTotal.textContent = money(quote.total);
      const breakdown = quote.memberBreakdown.map(member => {
        const role = member.role === 'PRIMARY' ? '主報名者' : (member.role === 'FAMILY' ? '家人' : '同行者');
        return `<section class="member-fee"><h4>${escapeHtml(role)}｜${escapeHtml(member.name)}</h4>` +
          (member.meeting ? `<div class="detail-row"><span>僅參加聚會</span><strong>${money(member.meeting)}</strong></div>` : '') +
          (member.accommodation ? `<div class="detail-row"><span>${escapeHtml(member.accommodationLabel)}</span><strong>${money(member.accommodation)}</strong></div>` : '') +
          `<div class="detail-row"><span>房型加價</span><strong>${money(member.room)}</strong></div>` +
          `<div class="detail-row"><span>旅遊費</span><strong>${money(member.travel)}</strong></div>` +
          `<div class="detail-row"><span>旅遊平安險</span><strong>${money(member.insurance)}</strong></div>` +
          `<div class="detail-row subtotal"><span>個人小計</span><strong>${money(member.total)}</strong></div></section>`;
      }).join('');
      const groupBreakdown = quote.groupFees.length
        ? `<section class="member-fee"><h4>整筆活動費</h4>` +
          quote.groupFees.map(item =>
            `<div class="detail-row"><span>${escapeHtml(item.item)}</span><strong>${money(item.amount)}</strong></div>`
          ).join('') + '</section>'
        : '';
      el.feeDetails.innerHTML = breakdown + groupBreakdown +
        `<div class="detail-row total"><span>報名時應繳總額</span><strong>${money(quote.total)}</strong></div>` +
        (quote.pending.length ? '<p class="warning-text">待確認項目不納入總額。</p>' : '');
      el.onsiteReminder.textContent = quote.onsite.length
        ? '當場繳交提醒：' + quote.onsite.map(item => `${item.item} ${money(item.amount)}`).join('；')
        : (quote.pending.length ? '另有待確認收費，請查看路線細目' : '目前無當場繳交項目');
    }

    function roomCapacityWarningKey(members) {
      const type = registrationType();
      if (meetingOnly() || !['TEAM', 'FAMILY'].includes(type) ||
          el.accommodation.value !== 'HOWARD') return '';
      const capacities = { SIX: 6, QUAD: 4, TRIPLE: 3, DOUBLE: 2 };
      const capacity = capacities[el.roomType.value] || 0;
      const age12PlusCount = members.filter(member =>
        member.identityCategory && member.identityCategory !== 'CHILD').length;
      if (!capacity || age12PlusCount >= capacity) return '';
      return [type, el.roomType.value, age12PlusCount, members.length].join('|');
    }

    async function submit(event) {
      event.preventDefault();
      if (state.submitting || state.completed) return;
      hideError();
      if (!el.form.reportValidity()) return;
      const members = participantPayload();
      const roomCapacityKey = roomCapacityWarningKey(members);
      if (roomCapacityKey && state.confirmedRoomCapacityKey !== roomCapacityKey) {
        state.pendingRoomCapacityKey = roomCapacityKey;
        el.groupRoomConfirm.checked = false;
        el.confirmRoomButton.disabled = true;
        el.roomCapacityDialog.showModal();
        return;
      }
      const route = currentRoute();
      const options = collectRouteOptions();
      if (!meetingOnly() && ['MOTORCYCLE', 'BICYCLE', 'COACH'].includes(transportMode()) && travelMode() === 'NONE') {
        showError('選擇機車隊、單車隊或搭乘遊覽車時，必須參加旅遊行程。');
        return;
      }
      if (transportMode() === 'COACH' && travelMode() === 'SELF_PAY') {
        showError('搭乘遊覽車不可選擇自行購票及用餐。');
        return;
      }
      if (route && !routeAllowed(route.id, travelMode(), transportMode())) {
        showError('所選交通工具無法選擇這條旅遊路線。');
        return;
      }
      if (travelMode() === 'SELF_PAY' && ['R01', 'R02'].includes(el.routeId.value)) {
        showError('自行購票及用餐不可選擇路線1或路線2。');
        return;
      }
      if (route && route.id === 'R05') {
        const paintballEligible = members.filter(member => ageForMember(member) >= 12).length;
        const waterballEligible = members.filter(member => ageForMember(member) >= 7).length;
        if (Number(options.r5PaintballCount || 0) > paintballEligible) {
          showError(`漆彈須滿12歲，目前最多可填 ${paintballEligible} 人。`);
          return;
        }
        if (Number(options.r5WaterballCount || 0) > waterballEligible) {
          showError(`水彈須滿7歲，目前最多可填 ${waterballEligible} 人。`);
          return;
        }
        const paintRemaining = Math.max(0, Number((state.config.activityCapacities || {}).r5Paintball || 40) - Number(state.config.route5ExistingPaintballCount || 0));
        const waterRemaining = Math.max(0, Number((state.config.activityCapacities || {}).r5Waterball || 50) - Number(state.config.route5ExistingWaterballCount || 0));
        if (Number(options.r5PaintballCount || 0) > paintRemaining || Number(options.r5WaterballCount || 0) > waterRemaining) {
          showError('活動參加人數超過目前剩餘名額，請重新選擇。');
          return;
        }
      }
      if (route && route.id === 'R06') {
        const childCount = members.filter(member => member.identityCategory === 'CHILD').length;
        const adultCount = members.length - childCount;
        if (Number(options.r6SubmarineCount || 0) > adultCount ||
          Number(options.r6SubmarineChildCount || 0) > childCount ||
          Number(options.r6SubmarineInfantCount || 0) > Number(options.r6SubmarineChildCount || 0)) {
          showError('半潛艇成人、兒童及未滿3歲人數不符合本次報名成員資料。');
          return;
        }
        const snorkelRemaining = Math.max(0, Number((state.config.activityCapacities || {}).r6Snorkel || 70) - Number(state.config.route6ExistingSnorkelCount || 0));
        if (Number(options.r6SnorkelCount || 0) > snorkelRemaining) {
          showError('浮潛參加人數超過目前剩餘名額，請重新選擇。');
          return;
        }
      }
      const payload = {
        registrationType: registrationType(),
        meetingOnly: meetingOnly(),
        participants: members,
        transportMode: transportMode(),
        travelMode: travelMode(),
        routeId: el.routeId.value,
        routeOptions: options,
        personalRoomConfirmed: el.personalRoomConfirm.checked,
        roomCapacityConfirmed: Boolean(roomCapacityKey && state.confirmedRoomCapacityKey === roomCapacityKey),
        email: el.email.value,
        note: document.getElementById('note').value,
        submissionKey: state.submissionKey
      };
      setSubmitting(true);
      try {
        const response = await server('submitRegistration', payload);
        if (!response || !response.ok) throw new Error(response && response.message || '送出失敗');
        document.getElementById('resultRegistrationId').textContent = response.registrationId;
        document.getElementById('resultTotal').textContent = money(response.totalDue);
        renderSubmissionFollowUp(response);
        state.completed = true;
        el.dialog.showModal();
      } catch (error) {
        showError(error.message);
      } finally {
        setSubmitting(false);
      }
    }

    function renderSubmissionFollowUp(response) {
      el.resultEmail.hidden = !response.email;
      el.resultEmail.classList.toggle('result-info-card--warning', Boolean(response.email && !response.emailSent && !response.emailQueued));
      el.resultEmailText.textContent = !response.email ? '' : response.emailSent
        ? `行程及費用明細已寄送至 ${response.email}。`
        : response.emailQueued
          ? `行程及費用明細已排入寄送至 ${response.email}，通常會在一分鐘內送達。`
          : `報名已完成，但郵件副本暫時無法排入寄送至 ${response.email}。請記下報名編號並和承辦人員聯絡。`;
      const financial = response.financialContact;
      el.resultFinancial.hidden = !financial;
      el.resultFinancialText.textContent = financial
        ? `${financial.areaLabel}：\n${financial.contacts.join('\n')}` : '';
      const group = response.routeGroup;
      el.resultRouteGroup.hidden = !group;
      if (!group) {
        el.resultRouteQr.removeAttribute('src');
        el.resultRouteLink.removeAttribute('href');
        return;
      }
      el.resultRouteGroupTitle.textContent = `${group.routeName}｜旅遊行程群組`;
      el.resultRouteQr.src = group.qrImageUrl;
      el.resultRouteQr.alt = `${group.routeName} LINE 群組 QR Code`;
      el.resultRouteLink.href = group.inviteUrl;
    }

    function setSubmitting(value) {
      state.submitting = value;
      el.submitButton.disabled = value || state.completed;
      el.submitButton.setAttribute('aria-busy', String(value));
      el.submitButton.textContent = state.completed ? '已完成報名' : value ? '送出中…' : '送出報名';
    }

    function showError(message) {
      el.globalMessage.textContent = message;
      el.globalMessage.hidden = false;
      el.globalMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function hideError() { el.globalMessage.hidden = true; }
  }

  function initReport() {
    const state = { token: '', filtersLoaded: false, columns: [] };
    const el = {
      loginPanel: document.getElementById('loginPanel'),
      loginForm: document.getElementById('loginForm'),
      password: document.getElementById('reportPassword'),
      loginButton: document.getElementById('loginButton'),
      loginMessage: document.getElementById('loginMessage'),
      app: document.getElementById('reportApp'),
      stats: document.getElementById('reportStats'),
      table: document.getElementById('reportTable'),
      title: document.getElementById('reportTitle'),
      description: document.getElementById('reportDescription'),
      reportMessage: document.getElementById('reportMessage'),
      downloadButton: document.getElementById('downloadButton'),
      view: document.getElementById('reportView')
    };
    const filterMap = {
      OVERVIEW: ['keyword', 'registrationType', 'church', 'careArea', 'district', 'staying', 'roomType', 'travelMode', 'route', 'transport'],
      DUPLICATES: ['keyword', 'duplicateLevel', 'church', 'careArea', 'district'],
      AREA: ['keyword', 'registrationType', 'church', 'careArea', 'district'],
      COACH: ['keyword', 'route'], ROUTE: ['keyword', 'route', 'transport'],
      RESTAURANT: ['keyword', 'restaurant', 'route'], INSURANCE: ['keyword', 'route', 'transport'],
      ACTIVITY: ['keyword', 'activity', 'route'],
      ACCOMMODATION: ['keyword', 'roomType', 'church', 'careArea', 'district'],
      FINANCE: ['keyword', 'registrationType', 'church', 'careArea', 'district'],
      TRANSPORT: ['keyword', 'transport', 'route'], ISSUES: ['keyword', 'church', 'careArea', 'district']
    };

    el.loginForm.addEventListener('submit', login);
    el.view.addEventListener('change', updateFilterVisibility);
    document.getElementById('applyFilters').addEventListener('click', loadReport);
    document.getElementById('clearFilters').addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(input => {
        if (input.dataset.filter !== 'view') input.value = '';
      });
      hideReportMessage();
    });
    document.querySelectorAll('[data-filter="keyword"]').forEach(input => {
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); loadReport(); }
      });
    });
    el.downloadButton.addEventListener('click', download);
    updateFilterVisibility();

    async function login(event) {
      event.preventDefault();
      el.loginButton.disabled = true;
      el.loginButton.textContent = '驗證中…';
      el.loginMessage.hidden = true;
      try {
        const response = await server('loginReport', el.password.value);
        if (!response || !response.ok) throw new Error(response && response.message || '登入失敗');
        state.token = response.token;
        el.password.value = '';
        el.loginPanel.hidden = true;
        el.app.hidden = false;
        await loadReport();
      } catch (error) {
        el.loginMessage.textContent = error.message;
        el.loginMessage.hidden = false;
      } finally {
        el.loginButton.disabled = false;
        el.loginButton.textContent = '登入';
      }
    }

    function filters() {
      const result = {};
      document.querySelectorAll('[data-filter]').forEach(input => result[input.dataset.filter] = input.value);
      return result;
    }

    function updateFilterVisibility() {
      const allowed = filterMap[el.view.value] || [];
      document.querySelectorAll('[data-filter-wrap]').forEach(wrapper => {
        const active = allowed.includes(wrapper.dataset.filterWrap);
        wrapper.hidden = !active;
        if (!active) wrapper.querySelector('[data-filter]').value = '';
      });
    }

    async function loadReport() {
      const applyButton = document.getElementById('applyFilters');
      try {
        applyButton.disabled = true;
        applyButton.textContent = '套用中…';
        const response = await server('getReportData', state.token, filters());
        if (!response || !response.ok) throw new Error(response && response.message || '讀取失敗');
        if (!state.filtersLoaded) {
          populateFilters(response.filterOptions);
          state.filtersLoaded = true;
        }
        renderStats(response.metrics || []);
        state.columns = response.columns || [];
        el.title.textContent = response.title || '報名資料';
        el.description.textContent = response.description || '';
        renderTable(response.rows || []);
        document.getElementById('routeStats').innerHTML = (response.pills || [])
          .map(item => `<span class="route-pill">${escapeHtml(item)}</span>`).join('');
        hideReportMessage();
      } catch (error) {
        showReportMessage(error.message, true);
        if (/登入|逾時/.test(error.message)) {
          state.token = '';
          el.app.hidden = true;
          el.loginPanel.hidden = false;
        }
      } finally {
        applyButton.disabled = false;
        applyButton.textContent = '套用篩選';
      }
    }

    function populateFilters(options) {
      const map = {
        registrationType: options.registrationTypes, church: options.churches, careArea: options.careAreas,
        district: options.districts, roomType: options.roomTypes, travelMode: options.travelModes, route: options.routes,
        transport: options.transports, restaurant: options.restaurants, activity: options.activities,
        duplicateLevel: options.duplicateLevels
      };
      Object.keys(map).forEach(key => {
        const select = document.querySelector(`[data-filter="${key}"]`);
        select.innerHTML = '<option value="">全部</option>' +
          map[key].map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      });
    }

    function renderStats(metrics) {
      el.stats.innerHTML = metrics.map(metric => `<article class="stat-card ${metric.money ? 'stat-card--money' : ''}">` +
        `<span>${escapeHtml(metric.label)}</span><strong>${metric.money ? money(metric.value) : escapeHtml(metric.value)}</strong></article>`).join('');
    }

    function renderTable(rows) {
      el.table.tHead.innerHTML = '<tr>' + state.columns.map(column => `<th>${escapeHtml(column)}</th>`).join('') + '</tr>';
      el.table.tBodies[0].innerHTML = rows.map(row => '<tr>' + state.columns.map(column => {
        let value = row[column];
        const isMoney = ['基本費', '住宿費', '房型加價', '旅遊費', '保險費', '應收總額'].includes(column);
        if (column === '報名時間' && value) value = new Date(value).toLocaleString('zh-TW', { hour12: false });
        if (isMoney) value = money(value);
        return `<td class="${isMoney ? 'money' : ''}">${escapeHtml(value)}</td>`;
      }).join('') + '</tr>').join('');
      document.getElementById('resultCount').textContent = `目前顯示 ${rows.length} 筆`;
    }

    async function download() {
      el.downloadButton.disabled = true;
      el.downloadButton.textContent = '產生中…';
      try {
        const response = await server('downloadExcel', state.token, 'current', filters());
        if (!response || !response.ok) throw new Error(response && response.message || '下載失敗');
        const bytes = base64ToBytes(response.base64);
        const blob = new Blob([bytes], { type: response.mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = response.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showReportMessage('Excel 已產生並開始下載。', false);
      } catch (error) {
        showReportMessage(error.message, true);
      } finally {
        el.downloadButton.disabled = false;
        el.downloadButton.textContent = '下載目前名單 Excel';
      }
    }

    function base64ToBytes(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }

    function showReportMessage(message, error) {
      el.reportMessage.textContent = message;
      el.reportMessage.className = error ? 'message message--error' : 'message';
      el.reportMessage.hidden = false;
    }
    function hideReportMessage() { el.reportMessage.hidden = true; }
  }

  function createSubmissionKey() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
})();
