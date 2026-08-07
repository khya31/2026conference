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

  function createSubmissionKey() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  if (page === 'registration') initRegistration();
  if (page === 'report') initReport();

  function initRegistration() {
    const state = {
      config: null,
      memberCounter: 0,
      submissionKey: createSubmissionKey(),
      submitting: false,
      earlyBirdTimer: null,
      earlyBirdRequestId: 0,
      insuranceByMember: {},
      personalRoomConfirmationKey: '',
      roomCapacityConfirmationKey: ''
    };

    const el = {
      form: document.getElementById('registrationForm'),
      participants: document.getElementById('participants'),
      addMember: document.getElementById('addAdultButton'),
      memberTemplate: document.getElementById('adultTemplate'),
      email: document.getElementById('email'),
      meetingOnly: document.getElementById('meetingOnly'),
      accommodationSection: document.getElementById('accommodationSection'),
      accommodation: document.getElementById('groupAccommodation'),
      roomField: document.getElementById('groupRoomField'),
      roomType: document.getElementById('groupRoomType'),
      hotelInfo: document.getElementById('groupHotelInfo'),
      hotelPricingDescription: document.getElementById('hotelPricingDescription'),
      meetingOnlyDescription: document.getElementById('meetingOnlyDescription'),
      insurancePrice: document.getElementById('insurancePrice'),
      roomConfirmationPanel: document.getElementById('roomConfirmationPanel'),
      personalRoomConfirmation: document.getElementById('personalRoomConfirmation'),
      personalRoomConfirmed: document.getElementById('personalRoomConfirmed'),
      personalRoomConfirmationText: document.getElementById('personalRoomConfirmationText'),
      roomCapacityConfirmation: document.getElementById('roomCapacityConfirmation'),
      roomCapacityConfirmed: document.getElementById('roomCapacityConfirmed'),
      roomCapacityConfirmationText: document.getElementById('roomCapacityConfirmationText'),
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
      globalMessage: document.getElementById('globalMessage'),
      dialog: document.getElementById('resultDialog'),
      resultFinancial: document.getElementById('resultFinancial'),
      resultFinancialText: document.getElementById('resultFinancialText'),
      resultRouteGroup: document.getElementById('resultRouteGroup'),
      resultRouteGroupTitle: document.getElementById('resultRouteGroupTitle'),
      resultRouteQr: document.getElementById('resultRouteQr'),
      resultRouteLink: document.getElementById('resultRouteLink')
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
    }

    async function load() {
      try {
        const response = await server('getInitialData');
        if (!response || !response.ok) throw new Error(response && response.message || '初始化失敗');
        state.config = response;

        // 主報名者卡片必須先建立；後續規則或顯示文字讀取失敗時，
        // 不得讓整個成員區維持空白。
        el.participants.replaceChildren();
        addMember(true);

        if (!response.event || !response.rules || !Array.isArray(response.rules.routes) ||
            !Array.isArray(response.rules.roomTypes) || !Array.isArray(response.rules.identities)) {
          throw new Error('GAS 回傳的初始化資料不完整，請確認已部署目前的 Code.gs。');
        }

        document.getElementById('eventTitle').textContent = response.event.title;
        document.getElementById('eventDate').textContent = response.event.date;
        el.routeId.innerHTML = '<option value="">請選擇一條路線</option>';
        response.rules.routes.forEach(route => {
          const option = new Option(route.name, route.id);
          option.dataset.baseName = route.name;
          el.routeId.add(option);
        });
        response.rules.roomTypes.forEach(room => {
          const suffix = Number(room.surcharge || 0) ? `（成人＋${room.surcharge}元）` : '';
          el.roomType.add(new Option(room.label + suffix, room.value));
        });
        const pricing = response.pricing;
        if (!pricing || !pricing.routes || !pricing.ticketTables || !Array.isArray(pricing.insuranceModes)) {
          throw new Error(`GAS 後端版本 ${response.version || '未知'} 尚未提供完整計價規則，請重新部署目前的 Code.gs。`);
        }
        const selfOption = el.accommodation.querySelector('option[value="SELF"]');
        if (selfOption) selfOption.textContent = `住宿自理（每人${pricing.selfAccommodationFee}元）`;
        el.meetingOnlyDescription.textContent = `每人 ${pricing.meetingOnlyFee} 元，會計入報名時應繳明細；勾選後不調查交通工具、住宿及旅遊行程。`;
        el.insurancePrice.textContent = `每人 ${pricing.travelInsuranceFee} 元`;
        el.hotelPricingDescription.textContent = response.rules.roomTypes.map(room =>
          `${room.label}${Number(room.surcharge || 0) ? `每位成人加 ${room.surcharge} 元` : '不加價'}`
        ).join('、') + '。幼兒及兒童不加收房型費。';
        renderAll();
      } catch (error) {
        if (!el.participants.querySelector('.member-card')) {
          el.participants.innerHTML = '<div class="message message--error">成員資料載入失敗，請依上方錯誤訊息檢查後端部署版本。</div>';
        }
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
      if (event.target.name === 'registrationType') updateRegistrationType();
      if (event.target === el.meetingOnly) updateMeetingOnly();
      if (event.target === el.accommodation || event.target === el.roomType) updateAccommodation();
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
      const names = cards.map(card => fieldValue(card, 'name'));
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
            if (fieldValue(card, 'name') !== names[index]) return;
            const result = response.results && response.results[index];
            renderEarlyBirdStatus(card, result && result.status || 'NONE');
          });
        } catch (_) {
          // 早鳥資料只提供提示，不阻擋報名。
        }
      }, 450);
    }

    function renderEarlyBirdStatus(card, status) {
      const badge = card.querySelector('[data-early-bird-status]');
      badge.classList.remove('early-bird-status--paid', 'early-bird-status--unpaid');
      if (status === 'PAID') {
        badge.textContent = '您有已付款的早鳥方案，完成報名後請和青職組聯絡。';
        badge.classList.add('early-bird-status--paid');
        badge.hidden = false;
      } else if (status === 'UNPAID') {
        badge.textContent = '您的早鳥方案資格因未付款已取消。';
        badge.classList.add('early-bird-status--unpaid');
        badge.hidden = false;
      } else {
        badge.textContent = '';
        badge.hidden = true;
      }
    }

    function registrationType() {
      const checked = el.form.querySelector('[name="registrationType"]:checked');
      return checked ? checked.value : 'PERSONAL';
    }

    function meetingOnly() {
      return el.meetingOnly.checked;
    }

    function transportMode() {
      if (meetingOnly()) return '';
      const checked = el.form.querySelector('[name="transportMode"]:checked');
      return checked ? checked.value : '';
    }

    function travelMode() {
      if (meetingOnly()) return 'NONE';
      const checked = el.form.querySelector('[name="travelMode"]:checked');
      return checked ? checked.value : 'NONE';
    }

    function currentRoute() {
      return state.config.rules.routes.find(route => route.id === el.routeId.value) || null;
    }

    function updateRegistrationType() {
      if (registrationType() === 'PERSONAL') {
        [...el.participants.querySelectorAll('.member-card:not([data-primary="true"])')].forEach(card => {
          delete state.insuranceByMember[card.dataset.memberId];
          card.remove();
        });
        const pricing = state.config && state.config.pricing;
        if (!meetingOnly() && el.accommodation.value === 'HOWARD' && pricing) {
          el.roomType.value = pricing.personalRoomWithoutConfirmation;
        }
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
      card.querySelector('[data-field="church"]').innerHTML = '<option value="">請選擇</option>' +
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

    function isChildCard(card) {
      return card.querySelector('[data-field="identityCategory"]').value === 'CHILD';
    }

    function updateAgeFields(card) {
      const child = isChildCard(card);
      const primary = card.dataset.primary === 'true';
      const childAgeField = card.querySelector('.child-age-field');
      const ageInput = childAgeField.querySelector('select');
      childAgeField.hidden = !child;
      ageInput.required = child;
      if (!child) ageInput.value = '';
      card.querySelectorAll('.adult-only').forEach(field => field.hidden = child);
      card.querySelectorAll('.adult-only input, .adult-only select').forEach(input => {
        input.required = !child && input.dataset.optional !== 'true';
        if (child) input.value = '';
      });
      updateAreaFields(card, false);
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

    function participantCountAge12Plus() {
      return participantPayload(false).filter(member => member.identityCategory !== 'CHILD').length;
    }

    function selectedRoomLabel() {
      const room = state.config && state.config.rules && state.config.rules.roomTypes.find(item =>
        item.value === el.roomType.value);
      return room ? room.label : '所選房型';
    }

    function roomCapacityMessage(age12PlusCount, roomCapacity, roomLabel) {
      const common = '請更換房型或由青職組安排同住者。若無合適同住者，屆時需加收空床費。';
      if (age12PlusCount < roomCapacity) {
        return `您的報名人數未達房型人數，${common}`;
      }
      return `您的12歲以上報名人數無法完整分配至${roomLabel}，${common}`;
    }

    function updateAccommodation() {
      const hotel = !meetingOnly() && el.accommodation.value === 'HOWARD';
      el.roomField.hidden = !hotel;
      el.roomType.required = hotel;
      el.roomType.disabled = meetingOnly();
      if (!hotel) {
        el.roomType.value = '';
      } else if (registrationType() === 'PERSONAL' && !el.roomType.value && state.config && state.config.pricing) {
        el.roomType.value = state.config.pricing.personalRoomWithoutConfirmation;
      }
      el.hotelInfo.hidden = !hotel;
      updateRoomConfirmations();
    }

    function updateRoomConfirmations() {
      const pricing = state.config && state.config.pricing;
      if (!pricing) return;

      const hotel = !meetingOnly() && el.accommodation.value === 'HOWARD' && Boolean(el.roomType.value);
      const type = registrationType();
      const roomLabel = selectedRoomLabel();
      const roomCapacity = Number(pricing.roomCapacities[el.roomType.value] || 0);
      const age12PlusCount = participantCountAge12Plus();

      const personalNeeded = hotel && type === 'PERSONAL' &&
        el.roomType.value !== pricing.personalRoomWithoutConfirmation;
      const personalKey = personalNeeded ? el.roomType.value : '';
      if (personalKey !== state.personalRoomConfirmationKey) {
        el.personalRoomConfirmed.checked = false;
        state.personalRoomConfirmationKey = personalKey;
      }
      const personalMessage = personalNeeded
        ? `您選擇的是${roomLabel}，同住者將由青職組安排。若無合適配對者，屆時需加收空床費。`
        : '';
      el.personalRoomConfirmationText.textContent = personalMessage;
      el.personalRoomConfirmation.hidden = !personalNeeded;
      el.personalRoomConfirmed.required = personalNeeded;
      el.personalRoomConfirmed.setCustomValidity(personalNeeded && !el.personalRoomConfirmed.checked
        ? personalMessage + '請先打勾確認。' : '');
      if (!personalNeeded) el.personalRoomConfirmed.checked = false;

      const capacityNeeded = hotel && ['TEAM', 'FAMILY'].includes(type) && roomCapacity > 0 &&
        age12PlusCount % roomCapacity !== 0;
      const capacityKey = capacityNeeded ? `${type}|${el.roomType.value}|${age12PlusCount}` : '';
      if (capacityKey !== state.roomCapacityConfirmationKey) {
        el.roomCapacityConfirmed.checked = false;
        state.roomCapacityConfirmationKey = capacityKey;
      }
      const capacityMessage = capacityNeeded
        ? roomCapacityMessage(age12PlusCount, roomCapacity, roomLabel)
        : '';
      el.roomCapacityConfirmationText.textContent = capacityMessage;
      el.roomCapacityConfirmation.hidden = !capacityNeeded;
      el.roomCapacityConfirmed.required = capacityNeeded;
      el.roomCapacityConfirmed.setCustomValidity(capacityNeeded && !el.roomCapacityConfirmed.checked
        ? capacityMessage + '請先打勾確認。' : '');
      if (!capacityNeeded) el.roomCapacityConfirmed.checked = false;

      el.roomConfirmationPanel.hidden = !personalNeeded && !capacityNeeded;
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
      if ((mustTravel && noneInput.checked) || (selfPayForbidden && selfPayInput.checked)) standardInput.checked = true;
    }

    function routeAllowed(routeId, mode, transport) {
      const transportRule = state.config.rules.transportModes.find(item => item.value === transport);
      if (!transportRule || !transportRule.routes.includes(routeId)) return false;
      if (mode === 'SELF_PAY' && transport === 'COACH') return false;
      return !(mode === 'SELF_PAY' && ['R01', 'R02'].includes(routeId));
    }

    function insuranceMode() {
      if (meetingOnly() || travelMode() === 'NONE' || !el.routeId.value) return 'NONE';
      const rule = state.config.pricing.insuranceModes.find(item =>
        item.transports.includes(transportMode()) && item.routes.includes(el.routeId.value));
      return rule ? rule.mode : 'NONE';
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
        data[input.dataset.insuranceField] = String(input.value || '').trim();
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

    function renderInsuranceSurvey() {
      captureInsuranceSurvey();
      const mode = insuranceMode();
      el.insuranceSurvey.hidden = mode === 'NONE';
      if (mode === 'NONE') {
        [...el.participants.querySelectorAll('.adult-card')].forEach(card => {
          state.insuranceByMember[card.dataset.memberId] = emptyInsuranceData();
        });
        el.insuranceParticipants.innerHTML = '';
        return;
      }
      const required = mode === 'REQUIRED';
      el.insuranceTitle.textContent = required ? '旅遊平安保險（必須投保）' : '旅遊平安保險（可自行選擇）';
      const insuranceFee = state.config.pricing.travelInsuranceFee;
      el.insuranceDescription.textContent = required
        ? `此交通工具與路線規定每位成員都必須投保，每位保費 ${insuranceFee} 元。`
        : `每位成員可分開選擇是否投保，每位保費 ${insuranceFee} 元。`;
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
        const memberName = fieldValue(card, 'name') || '姓名尚未填寫';
        const insuranceSelect = required
          ? '<select data-insurance-field="travelInsurance" disabled><option value="YES" selected>必須投保（加收50元）</option></select>'
          : `<select data-insurance-field="travelInsurance"><option value="NO" ${insured ? '' : 'selected'}>否</option><option value="YES" ${insured ? 'selected' : ''}>是（加收50元）</option></select>`;
        const guardianFields = child ? `<div class="guardian-fields form-grid" data-guardian-fields ${insured ? '' : 'hidden'}>
          <label class="field"><span>監護人姓名</span><input data-insurance-field="guardianName" maxlength="40" value="${escapeHtml(data.guardianName)}" ${insured ? 'required' : ''}></label>
          <label class="field"><span>監護人出生年月日（民國年）</span><input data-insurance-field="guardianBirthRoc" inputmode="numeric" maxlength="10" pattern="[0-9]{1,3}[/-][0-9]{1,2}[/-][0-9]{1,2}" placeholder="例：60/01/02" value="${escapeHtml(data.guardianBirthRoc)}" ${insured ? 'required' : ''}></label>
          <label class="field"><span>監護人身分證字號</span><input data-insurance-field="guardianNationalId" maxlength="10" pattern="[A-Za-z][12][0-9]{8}" autocapitalize="characters" placeholder="例：A123456789" value="${escapeHtml(data.guardianNationalId)}" ${insured ? 'required' : ''}></label>
        </div>` : '';
        return `<article class="insurance-member" data-member-id="${memberId}" data-child="${child}">
          <h4>${escapeHtml(role)}｜${escapeHtml(memberName)}<span class="insurance-name-note">※ 姓名需與身分證相同</span></h4>
          <label class="field"><span>是否加保旅遊平安險</span>${insuranceSelect}</label>
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
      updateRoomConfirmations();
      renderQuote();
    }

    function includeRouteItem(item, options) {
      if (!item.coachOnly) return true;
      if (transportMode() === 'COACH') return true;
      return Boolean(item.optionalCarpoolLunch && transportMode() === 'CARPOOL' && options.r10_4Lunch === 'YES');
    }

    function renderRoute() {
      const mode = travelMode();
      const selfPay = mode === 'SELF_PAY';
      const transport = transportMode();
      [...el.routeId.options].forEach(option => {
        if (!option.value) return;
        const allowed = routeAllowed(option.value, mode, transport);
        option.disabled = !allowed;
        option.textContent = option.dataset.baseName + (allowed ? '' : '（您無法選擇此路線）');
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
        el.onsiteTable.innerHTML = '';
        el.pendingTable.innerHTML = '';
        return;
      }
      const previousOptions = collectRouteOptions();
      renderRouteOptions(route, previousOptions);
      const options = collectRouteOptions();
      const visibleItinerary = (route.itinerary || []).filter(item => includeRouteItem(item, options));
      el.routeInfo.hidden = false;
      const routeNotes = route.notes && route.notes.length
        ? `<div class="route-notes"><strong>${escapeHtml(route.notesTitle || '行程備註')}</strong><ul>` +
          route.notes.map(note => `<li>${escapeHtml(note)}</li>`).join('') + '</ul></div>'
        : '';
      el.routeInfo.innerHTML = `<strong>${escapeHtml(route.name)}</strong><br>${escapeHtml(route.description)}` +
        (selfPay ? '<br><b>自行購票及用餐：旅遊費不納入報名總額。</b>' : '') +
        itineraryTable(visibleItinerary) + routeNotes;
      el.routeDetailTable.innerHTML = detailTable((route.details || []).filter(item => includeRouteItem(item, options)));
      renderFareNotice(route, options);
      el.onsiteTable.innerHTML = mode === 'STANDARD' ? priceTable('當場繳交價目表', onsiteRows(route, options)) : '';
      el.pendingTable.innerHTML = mode === 'STANDARD' ? priceTable('待確認項目', pendingRows(route), true) : '';
    }

    function itineraryTable(rows) {
      if (!rows.length) return '';
      let previousDate = '';
      const displayRows = rows.map(row => {
        const rawTime = String(row.time || '').trim();
        const match = rawTime.match(/^(\d{1,2}\/\d{1,2})\s+(.+)$/);
        let displayTime = rawTime;
        if (match) {
          const currentDate = match[1];
          displayTime = currentDate === previousDate ? match[2] : rawTime;
          previousDate = currentDate;
        }
        return Object.assign({}, row, { displayTime });
      });
      return `<div class="route-itinerary"><strong>詳細行程</strong><div class="route-itinerary-scroll">` +
        `<table aria-label="詳細行程"><thead><tr><th>時間</th><th>行程</th><th>說明</th></tr></thead><tbody>` +
        displayRows.map(row => `<tr><td>${escapeHtml(row.displayTime || '')}</td><td>${escapeHtml(row.activity || '')}</td><td>${escapeHtml(row.note || '')}</td></tr>`).join('') +
        '</tbody></table></div></div>';
    }

    function routePricingItem(routeId, collection, option) {
      const pricing = state.config.pricing.routes[routeId] || {};
      return (pricing[collection] || []).find(item => item.option === option) || null;
    }

    function renderRouteOptions(route, existing) {
      if (travelMode() === 'SELF_PAY') {
        el.routeOptions.innerHTML = '';
        return;
      }
      const members = participantPayload(false);
      const count = members.length;
      let html = '';
      if (['R03', 'R08'].includes(route.id)) {
        if (transportMode() === 'COACH') {
          html += '<div class="route-option-notice"><strong>10/4午餐已包含在遊覽車行程中。</strong></div>';
        } else if (transportMode() === 'CARPOOL') {
          html += optionGroup('10/4是否參加整組午餐', 'r10_4Lunch', [['NO', '不參加'], ['YES', '參加']], existing.r10_4Lunch || 'NO');
        }
      }
      if (route.id === 'R04') {
        const water = state.config.pricing.routes.R04.perSelectedMember;
        html += countField(`${water.item}參加人數（每人${water.amount}元；其餘人員可在沙灘休息）`,
          'r4WaterCount', count, existing.r4WaterCount);
      }
      if (route.id === 'R05') {
        const paintballEligible = members.filter(member => ageForMember(member) >= 12).length;
        const waterballEligible = members.filter(member => ageForMember(member) >= 7).length;
        const capacities = state.config.activityCapacities || {};
        const paintballRemaining = Math.max(0, Number(capacities.r5Paintball || 0) - Number(state.config.route5ExistingPaintballCount || 0));
        const waterballRemaining = Math.max(0, Number(capacities.r5Waterball || 0) - Number(state.config.route5ExistingWaterballCount || 0));
        const paintball = routePricingItem('R05', 'groupItems', 'r5PaintballCount');
        const waterball = routePricingItem('R05', 'groupItems', 'r5WaterballCount');
        html += countField(`${paintball.item}參加人數（須滿12歲，每人${paintball.amount}元）`, 'r5PaintballCount',
          Math.min(paintballEligible, paintballRemaining), existing.r5PaintballCount, paintballRemaining);
        html += countField(`${waterball.item}參加人數（須滿7歲，每人${waterball.amount}元）`, 'r5WaterballCount',
          Math.min(waterballEligible, waterballRemaining), existing.r5WaterballCount, waterballRemaining);
      }
      if (route.id === 'R06') {
        const adultCount = members.filter(member => member.identityCategory !== 'CHILD').length;
        const childCount = members.length - adultCount;
        const underThreeCount = members.filter(member => member.identityCategory === 'CHILD' && member.childAgeBand === 'INFANT').length;
        const capacities = state.config.activityCapacities || {};
        const snorkelRemaining = Math.max(0, Number(capacities.r6Snorkel || 0) - Number(state.config.route6ExistingSnorkelCount || 0));
        const snorkel = routePricingItem('R06', 'groupItems', 'r6SnorkelCount');
        const submarineAdult = routePricingItem('R06', 'groupItems', 'r6SubmarineCount');
        const submarineChild = routePricingItem('R06', 'groupItems', 'r6SubmarineChildCount');
        const submarineInfant = routePricingItem('R06', 'onsiteItems', 'r6SubmarineInfantCount');
        html += countField(`${snorkel.item}參加人數（每人${snorkel.amount}元，報名時繳交）`, 'r6SnorkelCount',
          Math.min(count, snorkelRemaining), existing.r6SnorkelCount, snorkelRemaining);
        html += countField(`${submarineAdult.item}參加人數（每人${submarineAdult.amount}元，報名時繳交）`, 'r6SubmarineCount',
          adultCount, existing.r6SubmarineCount);
        html += countField(`${submarineChild.item}參加人數（每人${submarineChild.amount}元，報名時繳交）`, 'r6SubmarineChildCount',
          childCount, existing.r6SubmarineChildCount);
        html += countField(`其中未滿3歲人數（現場購買每人${submarineInfant.amount}元保險票）`, 'r6SubmarineInfantCount',
          underThreeCount, existing.r6SubmarineInfantCount);
      }
      el.routeOptions.innerHTML = html ? `<div class="route-options">${html}</div>` : '';
    }

    function optionGroup(title, name, options, selected) {
      return `<fieldset class="field-group"><legend>${escapeHtml(title)}</legend><div class="choice-grid choice-grid--two">` +
        options.map(option => `<label class="choice compact"><input type="radio" name="${name}" value="${option[0]}" ${selected === option[0] ? 'checked' : ''} required><span><strong>${escapeHtml(option[1])}</strong></span></label>`).join('') +
        '</div></fieldset>';
    }

    function countField(title, name, maximum, selected, capacityRemaining) {
      const requested = selected === '' || selected == null ? 0 : Number(selected);
      const selectedValue = Math.min(Math.max(0, requested), maximum);
      const capacityText = capacityRemaining == null ? '' :
        `<small class="capacity-note">目前尚有 ${capacityRemaining} 個名額；本次選擇後剩 ${Math.max(0, capacityRemaining - selectedValue)} 個。</small>`;
      return `<label class="field activity-count"><span>${escapeHtml(title)}</span><select name="${name}" required>` +
        Array.from({ length: maximum + 1 }, (_, index) =>
          `<option value="${index}" ${index === selectedValue ? 'selected' : ''}>${index} 人</option>`).join('') +
        `</select>${capacityText}</label>`;
    }

    function collectRouteOptions() {
      const result = {};
      ['r4WaterCount', 'r5PaintballCount', 'r5WaterballCount', 'r6SnorkelCount',
        'r6SubmarineCount', 'r6SubmarineChildCount', 'r6SubmarineInfantCount'].forEach(name => {
        const input = el.form.querySelector(`[name="${name}"]`);
        if (input) result[name] = input.value;
      });
      if (['R03', 'R08'].includes(el.routeId.value)) {
        if (transportMode() === 'COACH') result.r10_4Lunch = 'YES';
        else {
          const lunch = el.form.querySelector('[name="r10_4Lunch"]:checked');
          result.r10_4Lunch = lunch ? lunch.value : 'NO';
        }
      }
      return result;
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
      const pricing = state.config.pricing.routes[route.id];
      (pricing && pricing.onsiteItems || []).forEach(item => {
        const count = Number(options[item.option] || 0);
        if (count) rows.push({ item: `${item.item}（${count}人）`, amount: count * item.amount });
      });
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

    function renderFareNotice(route, options) {
      if (travelMode() === 'SELF_PAY') {
        el.route7Count.hidden = false;
        el.route7Count.innerHTML = '<strong>以上皆為建議行程，請自行安排並和店家聯絡。</strong>';
        return;
      }
      if (route.id === 'R04') {
        el.route7Count.hidden = false;
        el.route7Count.innerHTML = '<strong>鹿境門票請於現場自行購買。</strong>';
        return;
      }
      const members = participantPayload(false);
      if (!['R06', 'R07', 'R08'].includes(route.id)) {
        el.route7Count.hidden = true;
        el.route7Count.innerHTML = '';
        return;
      }
      el.route7Count.hidden = false;
      if (route.id === 'R06') {
        const existing = Number(state.config.route6ExistingSubmarineAdultCount || 0);
        const current = Number(options.r6SubmarineCount || 0);
        const projected = existing + current;
        const threshold = Number(state.config.pricing.route6SubmarineInsuranceThreshold || 20);
        const status = projected >= threshold
          ? '成人已達門檻，承辦單位需要提前準備保險名單。'
          : `尚差 ${threshold - projected} 人達到保險名單準備門檻。`;
        el.route7Count.innerHTML = `<strong>半潛艇成人報名人數：</strong>目前已有 ${existing} 人，本次 ${current} 人，合計 ${projected} 人。${escapeHtml(status)}`;
        return;
      }
      let heading = '';
      let footnote = '';
      let ticketForMember;
      if (route.id === 'R07') {
        const projected = Number(state.config.route7ExistingCount || 0) + members.length;
        const threshold = Number(state.config.pricing.route7GroupThreshold || 20);
        const group = projected >= threshold;
        heading = `海生館票價：目前標準行程已有 ${state.config.route7ExistingCount} 人，含本次共 ${projected} 人；` +
          (group ? '已達團體票門檻，適用者採團體票。' : `尚差 ${threshold - projected} 人達到團體票門檻。`);
        ticketForMember = member => seaTicketInfo(member, group);
      } else {
        heading = '森林遊樂區票價判定（活動日為假日）：';
        footnote = '兒童資料採原本年齡區間：幼兒0～5歲以10元估算，若實際為0～2歲則免票；兒童6～11歲以75元估算，若實際為6歲則為10元。';
        ticketForMember = forestTicketInfo;
      }
      const rows = members.map((member, index) => {
        const ticket = ticketForMember(member);
        return `<li><strong>${escapeHtml(member.name || `成員${index + 1}`)}</strong>｜${escapeHtml(ageLabelForMember(member))}：${escapeHtml(ticket.label)} ${money(ticket.amount)}</li>`;
      }).join('');
      el.route7Count.innerHTML = `<strong>${escapeHtml(heading)}</strong><ul>${rows}</ul>` +
        (footnote ? `<small>${escapeHtml(footnote)}</small>` : '');
    }

    function participantPayload(captureInsurance = true) {
      if (captureInsurance) captureInsuranceSurvey();
      const sharedAccommodation = meetingOnly() ? 'SELF' : el.accommodation.value;
      const sharedRoomType = meetingOnly() ? '' : el.roomType.value;
      return [...el.participants.querySelectorAll('.adult-card')].map(card => {
        const insurance = Object.assign(emptyInsuranceData(), state.insuranceByMember[card.dataset.memberId] || {});
        return {
          role: card.dataset.primary === 'true' ? 'PRIMARY' : (registrationType() === 'FAMILY' ? 'FAMILY' : 'COMPANION'),
          name: fieldValue(card, 'name'),
          phone: fieldValue(card, 'phone'),
          church: fieldValue(card, 'church'),
          careArea: fieldValue(card, 'careArea'),
          district: fieldValue(card, 'district'),
          identityCategory: fieldValue(card, 'identityCategory'),
          childAgeBand: fieldValue(card, 'childAgeBand'),
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

    function fieldValue(card, field) {
      const input = card.querySelector(`[data-field="${field}"]`);
      return input ? String(input.value || '').trim() : '';
    }

    function ageForMember(member) {
      if (member.identityCategory === 'CHILD') return member.childAgeBand === 'INFANT' ? 5 : 8;
      if (member.identityCategory === 'YOUNG_35') return 30;
      if (member.identityCategory === 'YOUNG_ADULT') return 40;
      if (member.identityCategory === 'MIDDLE') return 55;
      if (member.identityCategory === 'ELDER') return 65;
      return -1;
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

    function seaTicketInfo(member, group) {
      const tickets = state.config.pricing.ticketTables.SEA_LIFE;
      const age = ageForMember(member);
      if (member.identityCategory === 'CHILD' && age <= 5) return tickets.infant;
      if (member.identityCategory === 'CHILD') return tickets.child;
      if (member.identityCategory === 'ELDER') return tickets.elder;
      return group ? tickets.groupAdult : tickets.adult;
    }

    function forestTicketInfo(member) {
      const tickets = state.config.pricing.ticketTables.FOREST;
      if (member.identityCategory === 'CHILD' && member.childAgeBand === 'INFANT') return tickets.youngChild;
      if (member.identityCategory === 'CHILD') return tickets.child;
      if (member.identityCategory === 'ELDER') return tickets.elder;
      return tickets.adult;
    }

    function calculateMemberTravel(member, memberIndex, routeId, options, transport, group, activityIndices) {
      const pricing = state.config.pricing.routes[routeId];
      if (!pricing) return { total: 0, items: [] };
      const items = [];
      if (pricing.ticketType === 'SEA_LIFE') {
        const ticket = seaTicketInfo(member, group);
        items.push({ item: `海生館門票（${ticket.label}）`, amount: ticket.amount });
      } else if (pricing.ticketType === 'FOREST') {
        const ticket = forestTicketInfo(member);
        items.push({ item: `森林遊樂區門票（${ticket.label}）`, amount: ticket.amount });
      }
      (pricing.memberItems || []).forEach(item => {
        if (item.condition === 'COACH' && transport !== 'COACH') return;
        if (item.condition === 'OCT4_LUNCH' && !(
          transport === 'COACH' || (transport === 'CARPOOL' && options.r10_4Lunch === 'YES'))) return;
        const infantFree = item.infantFree && member.identityCategory === 'CHILD' && member.childAgeBand === 'INFANT';
        items.push({ item: item.item, amount: infantFree ? 0 : Number(item.amount || 0) });
      });
      if (pricing.perSelectedMember) {
        const selected = activityIndices.includes(memberIndex);
        items.push({
          item: selected ? pricing.perSelectedMember.item : pricing.perSelectedMember.freeItem,
          amount: selected ? Number(pricing.perSelectedMember.amount || 0) : 0
        });
      }
      return { total: items.reduce((sum, item) => sum + item.amount, 0), items };
    }

    function selectedActivityIndices(members, route, options) {
      if (route && route.id === 'R04') return members.map((_, index) => index).slice(0, Number(options.r4WaterCount || 0));
      return [];
    }

    function calculateQuote() {
      const members = participantPayload();
      const route = currentRoute();
      const mode = travelMode();
      const transport = transportMode();
      const options = collectRouteOptions();
      const pricing = state.config.pricing;
      const group = route && route.id === 'R07' && mode === 'STANDARD' &&
        Number(state.config.route7ExistingCount || 0) + members.length >= Number(pricing.route7GroupThreshold || 20);
      const activityIndices = selectedActivityIndices(members, route, options);
      const insuranceRule = insuranceMode();
      let accommodation = 0;
      let surcharge = 0;
      let travel = 0;
      let meeting = 0;
      let insurance = 0;
      const memberBreakdown = [];
      const groupFees = [];

      members.forEach((member, index) => {
        const adult = member.identityCategory !== 'CHILD';
        const staying = member.accommodation === 'HOWARD';
        const room = state.config.rules.roomTypes.find(item => item.value === member.roomType) || { surcharge: 0 };
        let base = 0;
        if (staying) {
          if (!adult) base = member.childAgeBand === 'INFANT' ? pricing.accommodation.infant : pricing.accommodation.child;
          else base = ['MIDDLE', 'ELDER'].includes(member.identityCategory)
            ? pricing.accommodation.seniorAdult : pricing.accommodation.youngAdult;
        } else if (!meetingOnly()) {
          base = pricing.selfAccommodationFee;
        }
        const roomFee = adult && staying ? Number(room.surcharge || 0) : 0;
        const travelResult = mode === 'STANDARD' && route
          ? calculateMemberTravel(member, index, route.id, options, transport, group, activityIndices)
          : { total: 0, items: [] };
        const meetingFee = meetingOnly() ? pricing.meetingOnlyFee : 0;
        const insuranceFee = insuranceRule !== 'NONE' && member.travelInsurance === 'YES'
          ? pricing.travelInsuranceFee : 0;
        accommodation += base;
        surcharge += roomFee;
        travel += travelResult.total;
        meeting += meetingFee;
        insurance += insuranceFee;
        memberBreakdown.push({
          name: member.name || `成員${index + 1}`,
          role: member.role,
          accommodation: base,
          room: roomFee,
          travel: travelResult.total,
          meeting: meetingFee,
          insurance: insuranceFee,
          total: base + roomFee + travelResult.total + meetingFee + insuranceFee
        });
      });

      const routePricing = route && pricing.routes[route.id];
      if (mode === 'STANDARD' && routePricing && routePricing.groupItems) {
        routePricing.groupItems.forEach(item => {
          let count = Number(options[item.option] || 0);
          if (item.subtractOption) count = Math.max(0, count - Number(options[item.subtractOption] || 0));
          if (!count) return;
          const amount = count * Number(item.amount || 0);
          groupFees.push({ item: `${item.item}（${count}人，${item.amount}元／人）`, amount });
          travel += amount;
        });
      }

      return {
        accommodation, surcharge, travel, meeting, insurance,
        total: accommodation + surcharge + travel + meeting + insurance,
        memberBreakdown, groupFees,
        onsite: mode === 'STANDARD' && route ? onsiteRows(route, options) : [],
        pending: mode === 'STANDARD' && route ? pendingRows(route) : []
      };
    }

    function renderQuote() {
      const quote = calculateQuote();
      el.grandTotal.textContent = money(quote.total);
      const breakdown = quote.memberBreakdown.map(member => {
        const role = member.role === 'PRIMARY' ? '主報名者' : (member.role === 'FAMILY' ? '家人' : '同行者');
        return `<section class="member-fee"><h4>${escapeHtml(role)}｜${escapeHtml(member.name)}</h4>` +
          (member.meeting ? `<div class="detail-row"><span>僅參加聚會</span><strong>${money(member.meeting)}</strong></div>` : '') +
          `<div class="detail-row"><span>住宿／自理基本費</span><strong>${money(member.accommodation)}</strong></div>` +
          `<div class="detail-row"><span>房型加價</span><strong>${money(member.room)}</strong></div>` +
          `<div class="detail-row"><span>旅遊費</span><strong>${money(member.travel)}</strong></div>` +
          `<div class="detail-row"><span>旅遊平安險</span><strong>${money(member.insurance)}</strong></div>` +
          `<div class="detail-row subtotal"><span>個人小計</span><strong>${money(member.total)}</strong></div></section>`;
      }).join('');
      const groupBreakdown = quote.groupFees.length
        ? `<section class="member-fee"><h4>整筆活動費</h4>` +
          quote.groupFees.map(item => `<div class="detail-row"><span>${escapeHtml(item.item)}</span><strong>${money(item.amount)}</strong></div>`).join('') +
          '</section>' : '';
      el.feeDetails.innerHTML = breakdown + groupBreakdown +
        `<div class="detail-row total"><span>報名時應繳總額</span><strong>${money(quote.total)}</strong></div>` +
        (quote.pending.length ? '<p class="warning-text">待確認項目不納入總額。</p>' : '');
      el.onsiteReminder.textContent = quote.onsite.length
        ? '當場繳交提醒：' + quote.onsite.map(item => `${item.item} ${money(item.amount)}`).join('；')
        : (quote.pending.length ? '另有待確認收費，請查看路線細目' : '目前無當場繳交項目');
    }

    async function submit(event) {
      event.preventDefault();
      if (state.submitting) return;
      hideError();
      renderAll();
      if (!el.form.reportValidity()) return;
      const members = participantPayload();
      const route = currentRoute();
      const options = collectRouteOptions();
      if (!meetingOnly() && ['MOTORCYCLE', 'BICYCLE', 'COACH'].includes(transportMode()) && travelMode() === 'NONE') {
        showError('選擇機車隊、單車隊或搭乘遊覽車時，必須參加旅遊行程。');
        return;
      }
      if (route && !routeAllowed(route.id, travelMode(), transportMode())) {
        showError('所選交通工具無法選擇這條旅遊路線。');
        return;
      }
      if (route && route.id === 'R05') {
        const paintballEligible = members.filter(member => ageForMember(member) >= 12).length;
        const waterballEligible = members.filter(member => ageForMember(member) >= 7).length;
        if (Number(options.r5PaintballCount || 0) > paintballEligible || Number(options.r5WaterballCount || 0) > waterballEligible) {
          showError('漆彈或水彈參加人數超過符合年齡的成員人數。');
          return;
        }
      }
      if (route && route.id === 'R06') {
        const childCount = members.filter(member => member.identityCategory === 'CHILD').length;
        const adultCount = members.length - childCount;
        const underThreeCount = members.filter(member => member.identityCategory === 'CHILD' && member.childAgeBand === 'INFANT').length;
        if (Number(options.r6SubmarineCount || 0) > adultCount ||
            Number(options.r6SubmarineChildCount || 0) > childCount ||
            Number(options.r6SubmarineInfantCount || 0) > underThreeCount ||
            Number(options.r6SubmarineInfantCount || 0) > Number(options.r6SubmarineChildCount || 0)) {
          showError('半潛艇成人、兒童及未滿3歲人數不符合本次報名成員資料。');
          return;
        }
      }
      const payload = {
        registrationType: registrationType(),
        meetingOnly: meetingOnly(),
        participants: members,
        email: el.email.value.trim(),
        transportMode: transportMode(),
        travelMode: travelMode(),
        routeId: el.routeId.value,
        routeOptions: options,
        personalRoomConfirmed: el.personalRoomConfirmed.checked,
        roomCapacityConfirmed: el.roomCapacityConfirmed.checked,
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
        if (!response.duplicate) applySuccessfulSubmissionToCapacity(payload);
        el.dialog.showModal();
        state.submissionKey = createSubmissionKey();
      } catch (error) {
        showError(error.message);
      } finally {
        setSubmitting(false);
      }
    }

    function applySuccessfulSubmissionToCapacity(payload) {
      if (payload.travelMode !== 'STANDARD') return;
      const count = payload.participants.length;
      const options = payload.routeOptions || {};
      if (payload.routeId === 'R07') state.config.route7ExistingCount += count;
      if (payload.routeId === 'R05') {
        state.config.route5ExistingPaintballCount += Number(options.r5PaintballCount || 0);
        state.config.route5ExistingWaterballCount += Number(options.r5WaterballCount || 0);
      }
      if (payload.routeId === 'R06') {
        state.config.route6ExistingSnorkelCount += Number(options.r6SnorkelCount || 0);
        state.config.route6ExistingSubmarineAdultCount += Number(options.r6SubmarineCount || 0);
      }
      renderAll();
    }

    function renderSubmissionFollowUp(response) {
      const financial = response.financialContact;
      el.resultFinancial.hidden = !financial;
      el.resultFinancialText.textContent = financial ? `${financial.areaLabel}：\n${financial.contacts.join('\n')}` : '';
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
      el.submitButton.disabled = value;
      el.submitButton.textContent = value ? '送出中…' : '送出報名';
    }

    function showError(message) {
      el.globalMessage.textContent = message;
      el.globalMessage.hidden = false;
      el.globalMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hideError() {
      el.globalMessage.hidden = true;
    }
  }

  function initReport() {
    const state = { token: '', filtersLoaded: false, filterOptions: null, appliedFilters: null };
    const el = {
      loginPanel: document.getElementById('loginPanel'),
      loginForm: document.getElementById('loginForm'),
      password: document.getElementById('reportPassword'),
      loginButton: document.getElementById('loginButton'),
      loginMessage: document.getElementById('loginMessage'),
      app: document.getElementById('reportApp'),
      view: document.getElementById('reportView'),
      metricGrid: document.getElementById('metricGrid'),
      title: document.getElementById('reportTitle'),
      description: document.getElementById('reportDescription'),
      pills: document.getElementById('reportPills'),
      table: document.getElementById('reportTable'),
      resultCount: document.getElementById('resultCount'),
      reportMessage: document.getElementById('reportMessage'),
      applyFilters: document.getElementById('applyFilters'),
      downloadButton: document.getElementById('downloadButton'),
      downloadOptions: document.getElementById('downloadOptions')
    };

    el.loginForm.addEventListener('submit', login);
    document.getElementById('clearFilters').addEventListener('click', async () => {
      document.querySelectorAll('[data-filter]').forEach(input => {
        if (input.dataset.filter !== 'view') input.value = '';
      });
      updateViewFilters();
      updateAreaFilterOptions(false);
      await loadReport(collectFilters());
    });
    el.applyFilters.addEventListener('click', () => loadReport(collectFilters()));
    document.querySelectorAll('[data-filter]').forEach(input => {
      input.addEventListener(input.tagName === 'INPUT' ? 'input' : 'change', () => {
        if (input.dataset.filter === 'view') {
          updateViewFilters();
          const applied = Object.assign({}, state.appliedFilters || collectFilters(), { view: el.view.value });
          loadReport(applied);
          return;
        }
        if (input.dataset.filter === 'church') updateAreaFilterOptions(true);
        if (input.dataset.filter === 'careArea') updateDistrictFilterOptions(true);
      });
    });
    el.downloadButton.addEventListener('click', () => {
      el.downloadOptions.hidden = !el.downloadOptions.hidden;
    });
    el.downloadOptions.addEventListener('click', event => {
      const button = event.target.closest('[data-export]');
      if (button) download(button.dataset.export);
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.download-menu')) el.downloadOptions.hidden = true;
    });
    updateViewFilters();

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

    function collectFilters() {
      const result = {};
      document.querySelectorAll('[data-filter]').forEach(input => {
        if (!input.closest('[hidden]')) result[input.dataset.filter] = input.value;
      });
      result.view = el.view.value;
      return result;
    }

    function updateViewFilters() {
      const view = el.view.value;
      document.querySelectorAll('.view-filter').forEach(field => {
        field.hidden = !field.dataset.views.split(',').includes(view);
        if (field.hidden) field.querySelector('select').value = '';
      });
      if (!state.filterOptions) return;
      replaceSelectOptions('route', (state.filterOptions.routesByView || {})[view] || state.filterOptions.routes || []);
      replaceSelectOptions('transport', (state.filterOptions.transportsByView || {})[view] || state.filterOptions.transports || []);
    }

    function replaceSelectOptions(filterName, values) {
      const select = document.querySelector(`[data-filter="${filterName}"]`);
      if (!select) return;
      const selected = select.value;
      select.innerHTML = '<option value="">全部</option>' +
        values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      select.value = [...select.options].some(option => option.value === selected) ? selected : '';
    }

    function updateAreaFilterOptions(clearDependent) {
      if (!state.filterOptions) return;
      const church = document.querySelector('[data-filter="church"]').value;
      const hierarchy = state.filterOptions.areaHierarchy || {};
      const careAreasByChurch = hierarchy.careAreasByChurch || {};
      const values = church ? (careAreasByChurch[church] || []) : (state.filterOptions.careAreas || []);
      const careArea = document.querySelector('[data-filter="careArea"]');
      const previous = clearDependent ? '' : careArea.value;
      replaceSelectOptions('careArea', values);
      careArea.value = [...careArea.options].some(option => option.value === previous) ? previous : '';
      updateDistrictFilterOptions(clearDependent);
    }

    function updateDistrictFilterOptions(clearDependent) {
      if (!state.filterOptions) return;
      const church = document.querySelector('[data-filter="church"]').value;
      const careArea = document.querySelector('[data-filter="careArea"]').value;
      const district = document.querySelector('[data-filter="district"]');
      const hierarchy = state.filterOptions.areaHierarchy || {};
      const byChurch = hierarchy.districtsByChurchAndCareArea || {};
      const byCareArea = hierarchy.districtsByCareArea || {};
      const values = careArea
        ? ((church && byChurch[church] && byChurch[church][careArea]) || byCareArea[careArea] || [])
        : [];
      const previous = clearDependent ? '' : district.value;
      replaceSelectOptions('district', values);
      district.value = [...district.options].some(option => option.value === previous) ? previous : '';
      district.disabled = !careArea || values.length === 0;
    }

    async function loadReport(requestFilters) {
      if (!state.token) return;
      const nextFilters = Object.assign({}, requestFilters || state.appliedFilters || collectFilters());
      el.applyFilters.disabled = true;
      el.applyFilters.textContent = '套用中…';
      try {
        const response = await server('getReportData', state.token, nextFilters);
        if (!response || !response.ok) throw new Error(response && response.message || '讀取失敗');
        if (!state.filtersLoaded) {
          state.filterOptions = response.filterOptions || {};
          populateFilters(state.filterOptions);
          state.filtersLoaded = true;
          updateViewFilters();
          updateAreaFilterOptions(false);
        }
        state.appliedFilters = nextFilters;
        renderReport(response);
        hideReportMessage();
      } catch (error) {
        showReportMessage(error.message, true);
        if (/登入|逾時/.test(error.message)) {
          state.token = '';
          state.appliedFilters = null;
          el.app.hidden = true;
          el.loginPanel.hidden = false;
        }
      } finally {
        el.applyFilters.disabled = false;
        el.applyFilters.textContent = '套用篩選條件';
      }
    }

    function populateFilters(options) {
      const map = {
        registrationType: options.registrationTypes || [],
        church: options.churches || [],
        roomType: options.roomTypes || [],
        travelMode: options.travelModes || [],
        route: options.routes || [],
        transport: options.transports || [],
        restaurant: options.restaurants || [],
        activity: options.activities || [],
        duplicateLevel: options.duplicateLevels || []
      };
      Object.keys(map).forEach(key => {
        const select = document.querySelector(`[data-filter="${key}"]`);
        if (!select) return;
        const selected = select.value;
        select.innerHTML = '<option value="">全部</option>' +
          map[key].map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
        if ([...select.options].some(option => option.value === selected)) select.value = selected;
      });
    }

    function renderReport(response) {
      el.title.textContent = response.title || '報表';
      el.description.textContent = response.description || '';
      const metrics = response.metrics || [];
      el.metricGrid.innerHTML = metrics.map(metric =>
        `<article class="stat-card ${metric.money ? 'stat-card--money' : ''}"><span>${escapeHtml(metric.label)}</span><strong>${metric.money ? money(metric.value) : escapeHtml(metric.value)}</strong></article>`
      ).join('');
      el.metricGrid.hidden = metrics.length === 0;
      el.pills.innerHTML = (response.pills || []).map(text => `<span class="route-pill">${escapeHtml(text)}</span>`).join('');
      renderDynamicTable(response.columns || [], response.rows || []);
      el.resultCount.textContent = `目前顯示 ${response.rows ? response.rows.length : 0} 筆`;
    }

    function renderDynamicTable(columns, rows) {
      el.table.tHead.innerHTML = '<tr>' + columns.map(column => `<th>${escapeHtml(column)}</th>`).join('') + '</tr>';
      el.table.tBodies[0].innerHTML = rows.map(row => '<tr>' + columns.map(column => {
        let value = row[column];
        const isDate = /時間$/.test(column) && value;
        const isMoney = /金額|費$|總額|應收|小計/.test(column) && value !== '' && value != null && Number.isFinite(Number(value));
        if (isDate) {
          const date = new Date(value);
          if (!Number.isNaN(date.getTime())) value = date.toLocaleString('zh-TW', { hour12: false });
        }
        if (isMoney) value = money(value);
        return `<td class="${isMoney ? 'money' : ''}">${escapeHtml(value)}</td>`;
      }).join('') + '</tr>').join('');
    }

    async function download(type) {
      el.downloadOptions.hidden = true;
      el.downloadButton.disabled = true;
      el.downloadButton.textContent = '產生中…';
      try {
        const response = await server('downloadExcel', state.token, type, state.appliedFilters || collectFilters());
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
        el.downloadButton.textContent = '下載 Excel ▾';
      }
    }

    function base64ToBytes(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    }

    function showReportMessage(message, error) {
      el.reportMessage.textContent = message;
      el.reportMessage.className = error ? 'message message--error' : 'message';
      el.reportMessage.hidden = false;
    }

    function hideReportMessage() {
      el.reportMessage.hidden = true;
    }
  }
})();
