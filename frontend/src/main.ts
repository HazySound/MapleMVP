import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

mount(App, { target: document.getElementById('app')! })

// 글꼴은 화면을 막지 않게 뒤로 미룬다. 까닭은 fonts.ts에 적어 두었다
void import('./fonts')
